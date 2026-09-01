import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  OidcModuleOptions,
  OidcModuleOptionsFactory,
} from 'nest-oidc-provider';

import { ClientRepository } from 'src/clients/repositories/client.repository';
import { IdentityService } from 'src/identity/identity.service';
import { SigningKeyService } from 'src/signing-keys/services/signing-key/signing-key.service';
import { SecurityPolicyService } from 'src/security/services/security-policy/security-policy.service';

import { OidcClientAdapter } from '../adapters/oidc-client.adapter/oidc-client.adapter';
import { OidcAdapter } from '../adapters/oidc.adapter/oidc.adapter';
import { OidcRepository } from '../repositories/oidc.repository';

@Injectable()
export class OidcOptionsService
  implements OidcModuleOptionsFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly identityService: IdentityService,
    private readonly clientRepository: ClientRepository,
    private readonly oidcRepository: OidcRepository,
    private readonly signingKeyService: SigningKeyService,
    private readonly securityPolicyService: SecurityPolicyService,
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
    const securityPolicy =
      await this.securityPolicyService.getPolicy();

    /**
     * Get validated private JWKS.
     *
     * The private keys are used internally by oidc-provider
     * to sign tokens.
     *
     * oidc-provider automatically exposes only the public
     * components through the JWKS endpoint.
     */
    const jwks =
      this.signingKeyService.getPrivateJwks();

    return {
      issuer:
        this.config.get<string>('OIDC_ISSUER') ??
        'http://localhost:3000',

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
          AccessToken: () =>
            securityPolicy.accessTokenTtl,

          /**
           * ID Token lifetime.
           */
          IdToken: () =>
            securityPolicy.idTokenTtl,

          /**
           * Authorization Code lifetime.
           */
          AuthorizationCode: () =>
            securityPolicy.authorizationCodeTtl,

          /**
           * Refresh Token lifetime.
           */
          RefreshToken: () =>
            securityPolicy.refreshTokenTtl,

          /**
           * OIDC Session lifetime.
           */
          Session: () =>
            securityPolicy.sessionTtl,

          /**
           * Login / Consent interaction lifetime.
           */
          Interaction: () =>
            securityPolicy.interactionTtl,
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
        findAccount: async (
          ctx,
          accountId,
        ) => {
          if (
            typeof accountId !== 'string' ||
            !accountId
          ) {
            throw new Error(
              `Invalid OIDC accountId: ${accountId}`,
            );
          }

          const user =
            await this.identityService.findById(
              accountId,
            );

          if (!user) {
            throw new Error(
              `OIDC account not found: ${accountId}`,
            );
          }

          return {
            accountId: user.id,

            claims: async () => ({
              sub: user.id,

              name: user.username,

              preferred_username:
                user.username,

              email: user.email,

              email_verified: true,
            }),
          };
        },

        /**
         * OIDC FEATURES
         */
        features: {
          /**
           * Token revocation endpoint.
           */
          revocation: {
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
           * Dynamic Client Registration.
           */
          registration: {
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
          url(
            ctx,
            interaction,
          ) {
            return `/interaction/${interaction.uid}`;
          },
        },

        /**
         * PROVIDER SUPPORTED SCOPES
         *
         * Client-specific permissions are validated
         * from the dynamically loaded client.
         */
        scopes: [
          'openid',
          'profile',
          'email',
          'offline_access',
        ],

        /**
         * CLAIMS ASSOCIATED WITH SCOPES
         */
        claims: {
          /**
           * OpenID Connect subject identifier.
           */
          openid: [
            'sub',
          ],

          /**
           * Basic user profile information.
           */
          profile: [
            'name',
            'preferred_username',
          ],

          /**
           * User email information.
           */
          email: [
            'email',
            'email_verified',
          ],
        },
      },
    };
  }

  /**
   * OIDC Adapter Factory.
   *
   * Client:
   *   Dynamically resolved through ClientRepository.
   *
   * Other OIDC runtime models:
   *   Persisted through OidcRepository.
   */
  createAdapterFactory() {
    return (
      modelName: string,
    ) => {
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
       * ClientRepository
       */
      if (modelName === 'Client') {
        return new OidcClientAdapter(
          this.clientRepository,
        );
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
      return new OidcAdapter(
        modelName,
        this.oidcRepository,
      );
    };
  }
}