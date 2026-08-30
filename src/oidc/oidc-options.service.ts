import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  OidcModuleOptions,
  OidcModuleOptionsFactory,
} from 'nest-oidc-provider';

import { IdentityService } from 'src/identity/identity.service';
import { ClientRepository } from 'src/clients/repositories/client.repository';

import { OidcRepository } from './repositories/oidc.repository';

import { OidcAdapter } from './adapters/oidc.adapter/oidc.adapter';
import { OidcClientAdapter } from './adapters/oidc-client.adapter/oidc-client.adapter';

@Injectable()
export class OidcOptionsService
  implements OidcModuleOptionsFactory {
  constructor(
    private readonly config: ConfigService,
    private readonly identityService: IdentityService,
    private readonly clientRepository: ClientRepository,
    private readonly oidcRepository: OidcRepository,
  ) { }

  /**
   * OIDC Provider configuration.
   *
   * Clients are NOT loaded during application startup.
   * They are resolved dynamically through the Client adapter.
   */
  createModuleOptions(): OidcModuleOptions {
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

        extraClientMetadata: {
          properties: [
            'interaction_mode',
            'interaction_login_url',
            'interaction_consent_url',
          ],
        },

        /**
         * ACCOUNT LOOKUP
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
         * FEATURES
         */
        features: {
          revocation: {
            enabled: true,
          },

          devInteractions: {
            enabled: false,
          },

          introspection: {
            enabled: true,
          },
          registration: {
            enabled: true,
          },
        },

        /**
         * INTERACTIONS
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
         * Client-specific allowed scopes come
         * from the dynamically loaded client.
         */
        scopes: [
          'openid',
          'profile',
          'email',
          'offline_access',
        ],

        /**
         * CLAIMS
         */
        claims: {
          openid: [
            'sub',
          ],

          profile: [
            'name',
            'preferred_username',
          ],

          email: [
            'email',
            'email_verified',
          ],
        },
      },
    };
  }

  /**
   * OIDC Adapter Factory
   *
   * Client:
   *   SQLite via ClientRepository
   *
   * Other OIDC runtime models:
   *   SQLite via OidcRepository
   */
  createAdapterFactory() {
    return (
      modelName: string,
    ) => {
      /**
       * Dynamic client resolution.
       *
       * GET /auth?client_id=abc
       *
       * oidc-provider
       *      ↓
       * AdapterFactory('Client')
       *      ↓
       * OidcClientAdapter
       *      ↓
       * ClientRepository
       *      ↓
       * SQLite
       */
      if (modelName === 'Client') {
        return new OidcClientAdapter(
          this.clientRepository,
        );
      }

      /**
       * Runtime OIDC models.
       *
       * AuthorizationCode
       * AccessToken
       * RefreshToken
       * Session
       * Grant
       * Interaction
       * etc.
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