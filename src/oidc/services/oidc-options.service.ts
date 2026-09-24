import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { interactionPolicy } from 'oidc-provider';
import { join } from 'path';

import {
  OidcModuleOptions,
  OidcModuleOptionsFactory,
} from 'nest-oidc-provider';

import { IdentityService } from 'src/identity/identity.service';
import { OidcTokenService } from 'src/security/services/oidc-token.service';
import { SecurityPolicyService } from 'src/security/services/security-policy/security-policy.service';
import { SigningKeyService } from 'src/signing-keys/services/signing-key/signing-key.service';

import { ClientsService } from '../../clients/clients.service';
import { OidcClientAdapter } from '../adapters/oidc-client.adapter/oidc-client.adapter';
import { OidcAdapter } from '../adapters/oidc.adapter/oidc.adapter';
import { OidcRepository } from '../repositories/oidc.repository';
import { ClientRegistrationPolicyService } from './client-registration-policy/client-registration-policy.service';

@Injectable()
export class OidcOptionsService implements OidcModuleOptionsFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly identityService: IdentityService,
    private readonly oidcTokenService: OidcTokenService,
    private readonly oidcRepository: OidcRepository,
    private readonly signingKeyService: SigningKeyService,
    private readonly securityPolicyService: SecurityPolicyService,
    private readonly clientRegistrationPolicyService: ClientRegistrationPolicyService,
    private readonly clientsService: ClientsService,
  ) {}

  /**
   * OIDC Provider configuration.
   *
   * The security policy is loaded from the database during
   * provider initialization.
   *
   * oidc-provider TTL callbacks are synchronous, therefore
   * database access cannot happen inside the TTL callbacks.
   *
   * The policy values are loaded once during startup and captured
   * by the synchronous TTL callback closures.
   */
  async createModuleOptions(): Promise<OidcModuleOptions> {
    /**
     * Load server security policy from database.
     *
     * getPolicy() automatically creates the default policy
     * if one does not already exist.
     */
    const securityPolicy = await this.securityPolicyService.getPolicy();

    /**
     * Get validated private JWKS.
     *
     * The private keys are used internally by oidc-provider
     * to sign tokens.
     *
     * oidc-provider automatically exposes only the public
     * components through the JWKS endpoint.
     */
    const jwks = this.signingKeyService.getPrivateJwks();

    return {
      factory: ({ issuer, config, module }) => {
        const provider = new module.Provider(issuer, config);

        /**
         * oidc-provider's built-in UserInfo endpoint rejects every access
         * token with an audience. Our JWT access tokens are audience-bound,
         * so validate them here and return the same scope-filtered UserInfo
         * claims from the enabled account record.
         */
        provider.use(async (ctx, next) => {
          if (!['GET', 'POST'].includes(ctx.method) || ctx.path !== '/me') {
            return next();
          }

          const authorization = ctx.get('authorization');
          const match = /^Bearer\s+(.+)$/i.exec(authorization);
          const accessToken = match?.[1];

          // Preserve the provider's standard UserInfo behavior for opaque
          // access tokens and malformed/non-bearer requests.
          if (!accessToken || !accessToken.includes('.')) {
            return next();
          }

          const unauthorized = (error: string) => {
            ctx.status = 401;
            ctx.set('WWW-Authenticate', 'Bearer error="invalid_token"');
            ctx.body = { error };
          };

          let tokenInfo;
          try {
            tokenInfo = await this.oidcTokenService.validate(accessToken);
          } catch {
            unauthorized('invalid_token');
            return;
          }

          const scopes = new Set(tokenInfo.scope?.split(' ').filter(Boolean));
          if (!scopes.has('openid')) {
            ctx.status = 403;
            ctx.set(
              'WWW-Authenticate',
              'Bearer error="insufficient_scope", scope="openid"',
            );
            ctx.body = { error: 'insufficient_scope' };
            return;
          }

          const user = await this.identityService.findById(
            tokenInfo.sub,
            tokenInfo.clientId ?? '',
          );

          if (!user) {
            unauthorized('invalid_token');
            return;
          }

          const claims: Record<string, unknown> = { sub: user.id };
          if (scopes.has('profile')) {
            claims.name = user.username;
            claims.preferred_username = user.username;
          }
          if (scopes.has('email')) {
            claims.email = user.email;
            claims.email_verified = true;
          }
          if (scopes.has('roles')) {
            claims.roles = user.roles?.map((role) => role.name) ?? [];
          }

          ctx.status = 200;
          ctx.type = 'application/json';
          ctx.body = claims;
        });

        /**
         * When a browser already has an authenticated OIDC
         * session for another client, start a fresh session
         * for the requested client.
         *
         * Same-client requests continue to use normal OIDC SSO.
         */
        provider.use(async (ctx, next) => {
          if (ctx.method === 'GET' && ctx.path === '/auth') {
            const requestedClientId =
              typeof ctx.query.client_id === 'string'
                ? ctx.query.client_id
                : undefined;

            if (requestedClientId) {
              try {
                const session = await provider.Session.get(ctx);

                if (session?.accountId) {
                  const clientSessionId = session.sidFor(requestedClientId);

                  if (!clientSessionId) {
                    await session.destroy();

                    const { maxAge, ...cookieOptions } =
                      provider.configuration('cookies.long');

                    ctx.cookies.set(
                      provider.cookieName('session'),
                      null,
                      cookieOptions,
                    );

                    ctx.redirect(ctx.originalUrl);

                    return;
                  }
                }
              } catch {
                // Allow oidc-provider to handle the request
                // normally if the existing session cannot be read.
              }
            }
          }

          await next();
        });

        provider.on('registration_create.success', async (ctx) => {
          const initialAccessToken = ctx.oidc.entities.InitialAccessToken;

          if (initialAccessToken) {
            await initialAccessToken.destroy();
          }
        });

        provider.on('server_error', (ctx, error) => {
          console.error('========== OIDC SERVER ERROR ==========');
          console.error('URL:', ctx?.request?.url);
          console.error('Method:', ctx?.request?.method);
          console.error('Error:', error);
          console.error('Stack:', error?.stack);
          console.error('========================================');
        });

        provider.on('authorization.error', (ctx, error) => {
          console.error('========== OIDC AUTHORIZATION ERROR ==========');
          console.error('URL:', ctx?.request?.url);
          console.error('Error:', error);
          console.error('Stack:', error?.stack);
          console.error('==============================================');
        });

        provider.on('grant.error', (ctx, error) => {
          console.error('========== OIDC GRANT ERROR ==========');
          console.error('Error:', error);
          console.error('Stack:', error?.stack);
          console.error('======================================');
        });

        return provider;
      },

      issuer: this.config.get<string>('OIDC_ISSUER') ?? 'http://localhost:3000',

      path: '',

      oidc: {
        /**
         * No static clients.
         *
         * Clients are dynamically resolved using
         * OidcClientAdapter.
         */
        clients: [],

        /**
         * Signing keys.
         *
         * Contains private JWKs internally.
         *
         * Supports multiple keys for key rotation.
         */
        jwks,

        formats: {
          default: 'opaque',
          customizers: {
            jwt: async (_ctx, token, structuredToken) => {
              const scopes = new Set(
                (typeof structuredToken.payload.scope === 'string'
                  ? structuredToken.payload.scope
                  : ''
                )
                  .split(' ')
                  .filter(Boolean),
              );

              if (!scopes.has('roles') || typeof token.accountId !== 'string') {
                return;
              }

              const user = await this.identityService.findByIdForOidc(
                token.accountId,
              );

              if (user) {
                structuredToken.payload.roles =
                  user.roles?.map((role) => role.name) ?? [];
              }
            },
          },
        },

        conformIdTokenClaims: false,

        /**
         * TOKEN AND SESSION LIFETIMES
         *
         * Values are loaded dynamically from SecurityPolicy
         * during OIDC provider initialization.
         *
         * oidc-provider invokes these callbacks synchronously.
         */
        ttl: {
          /**
           * Access Token lifetime.
           */
          AccessToken: () => securityPolicy.accessTokenTtl,

          /**
           * ID Token lifetime.
           */
          IdToken: () => securityPolicy.idTokenTtl,

          /**
           * Authorization Code lifetime.
           */
          AuthorizationCode: () => securityPolicy.authorizationCodeTtl,

          /**
           * Refresh Token lifetime.
           */
          RefreshToken: () => securityPolicy.refreshTokenTtl,

          /**
           * OIDC Session lifetime.
           */
          Session: () => securityPolicy.sessionTtl,

          /**
           * Login / Consent interaction lifetime.
           */
          Interaction: () => securityPolicy.interactionTtl,

          InitialAccessToken: () => securityPolicy.initialAccessTokenTtl,

          RegistrationAccessToken: () =>
            securityPolicy.registrationAccessTokenTtl,
        },

        /**
         * Additional dynamic client metadata.
         *
         * Used to configure how login and consent
         * interactions are handled for a client.
         */
        extraClientMetadata: {
          properties: [
            'interaction_mode',
            'interaction_login_url',
            'interaction_consent_url',
          ],
        },

        /**
         * ACCOUNT LOOKUP
         *
         * Called by oidc-provider when it needs
         * account claims for a subject.
         */
        findAccount: async (ctx, accountId) => {
          if (typeof accountId !== 'string' || !accountId) {
            throw new Error(`Invalid OIDC accountId: ${accountId}`);
          }

          const clientId =
            ctx.oidc.params.client_id ?? ctx.oidc.accessToken?.clientId;

          const user = await this.identityService.findByIdForOidc(accountId);

          if (!user) {
            throw new Error(`OIDC account not found: ${accountId}`);
          }

          const requiredRole = await this.clientsService.requiredRoleForClient(
            clientId,
            ctx.oidc.params?.redirect_uri,
          );

          if (
            requiredRole &&
            !user.roles?.some((role) => role.name === requiredRole)
          ) {
            throw new Error(
              'OIDC account is not allowed to access this portal',
            );
          }

          return {
            accountId: user.id,

            claims: async () => ({
              sub: user.id,

              name: user.username,

              preferred_username: user.username,

              email: user.email,

              email_verified: true,

              roles: user.roles.map((role) => role.name),
            }),
          };
        },

        /**
         * OIDC FEATURES
         */
        features: {
          /**
           * Issue JWT access tokens for the provider's default API resource.
           * oidc-provider 9 selects token format through ResourceServer
           * metadata rather than the legacy formats.AccessToken option.
           */
          resourceIndicators: {
            enabled: true,
            defaultResource: async (_ctx, client) =>
              `urn:tscloak:client:${encodeURIComponent(client.clientId)}`,
            // Carry the default resource from the authorization request into
            // the code-exchange access token, including OpenID scope requests.
            useGrantedResource: async () => true,
            getResourceServerInfo: async (_ctx, resourceIndicator, client) => {
              const registeredClient = await this.clientsService.findByClientId(
                client.clientId,
              );
              const clientResource = `urn:tscloak:client:${encodeURIComponent(client.clientId)}`;

              return {
                audience:
                  resourceIndicator === clientResource
                    ? client.clientId
                    : resourceIndicator,
                scope:
                  registeredClient?.allowedScopes.join(' ') ??
                  'openid profile email offline_access roles',
                accessTokenFormat: 'jwt',
              };
            },
          },

          /**
           * Token revocation endpoint.
           */
          revocation: {
            enabled: true,
          },

          clientCredentials: {
            enabled: true,
          },

          /**
           * Disable oidc-provider's built-in
           * development interaction pages.
           *
           * TSCloak handles interactions itself.
           */
          devInteractions: {
            enabled: false,
          },

          /**
           * Token introspection endpoint.
           */
          introspection: {
            enabled: true,
          },

          /**
           * RP-Initiated Logout.
           */
          rpInitiatedLogout: {
            enabled: true,

            logoutSource: async (ctx, form) => {
              const clientId = ctx.oidc.params?.client_id;

              const client = clientId
                ? await this.clientsService.findByClientId(clientId)
                : null;

              const applicationName = client?.name ?? 'TSCloak';

              const template = await readFile(
                join(process.cwd(), 'src', 'oidc', 'views', 'logout.html'),
                'utf8',
              );

              ctx.body = template
                .replace('{{APPLICATION_NAME}}', applicationName)
                .replace('{{LOGOUT_FORM}}', form);
            },
          },

          /**
           * Dynamic Client Registration.
           */
          registration: {
            enabled: true,
            initialAccessToken: true,

            policies: this.clientRegistrationPolicyService.getPolicies(),
          },

          registrationManagement: {
            enabled: true,
          },
        },

        /**
         * OIDC INTERACTIONS
         *
         * All login and consent interactions
         * are routed through our interaction controller.
         */
        interactions: {
          policy: this.createInteractionPolicy(),

          url(ctx, interaction) {
            return `/interaction/${interaction.uid}`;
          },
        },

        /**
         * PROVIDER SUPPORTED SCOPES
         *
         * Client-specific permissions are validated
         * from the dynamically loaded client.
         */
        scopes: ['openid', 'profile', 'email', 'offline_access', 'roles'],

        /**
         * CLAIMS ASSOCIATED WITH SCOPES
         */
        claims: {
          /**
           * OpenID Connect subject identifier.
           */
          openid: ['sub'],

          /**
           * Basic user profile information.
           */
          profile: ['name', 'preferred_username'],

          /**
           * User email information.
           */
          email: ['email', 'email_verified'],

          roles: ['roles'],
        },
      },
    };
  }

  /**
   * Creates the OIDC interaction policy used by TSCloak.
   *
   * Client-session switching is handled by the provider
   * pre-middleware before oidc-provider starts processing
   * the authorization request.
   */
  private createInteractionPolicy() {
    return interactionPolicy.base();
  }

  /**
   * OIDC Adapter Factory.
   *
   * Client:
   *   Dynamically resolved through ClientsService.
   *
   * Other OIDC runtime models:
   *   Persisted through OidcRepository.
   */
  createAdapterFactory() {
    return (modelName: string) => {
      /**
       * Dynamic client resolution.
       *
       * GET /auth?client_id=...
       *
       * oidc-provider
       *      ↓
       * AdapterFactory('Client')
       *      ↓
       * OidcClientAdapter
       *      ↓
       * ClientsService
       */
      if (modelName === 'Client') {
        return new OidcClientAdapter(this.clientsService, this.config);
      }

      /**
       * Runtime OIDC models.
       *
       * Examples:
       *
       * AuthorizationCode
       * AccessToken
       * RefreshToken
       * Session
       * Grant
       * Interaction
       *
       * All persisted through OidcRepository.
       */
      return new OidcAdapter(modelName, this.oidcRepository);
    };
  }
}
