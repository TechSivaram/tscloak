import { Module } from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  OidcModule as NestOidcModule,
} from 'nest-oidc-provider';

import { OidcInteractionController } from './oidc-interaction/oidc-interaction.controller';

import { AuthenticationModule } from 'src/authentication/authentication.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { ClientsModule } from 'src/clients/clients.module';
import { IdentityModule } from 'src/identity/identity.module';

import { ClientRepository } from 'src/clients/repositories/client.repository';
import { IdentityService } from 'src/identity/identity.service';

@Module({
  imports: [
    ConfigModule,

    AuthenticationModule,
    SessionsModule,
    ClientsModule,
    IdentityModule,

    NestOidcModule.forRootAsync({
      imports: [
        ConfigModule,
        ClientsModule,
        IdentityModule,
      ],

      inject: [
        ConfigService,
        ClientRepository,
        IdentityService,
      ],

      useFactory: async (
        config: ConfigService,
        clientRepository: ClientRepository,
        identityService: IdentityService,
      ) => {
        const client =
          await clientRepository.findByClientId(
            '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363',
          );

        if (!client) {
          throw new Error(
            'OIDC test client was not found in database',
          );
        }

        return {
          issuer:
            config.get<string>('OIDC_ISSUER') ??
            'http://localhost:3000',

          path: '',

          oidc: {
            clients: [
              {
                client_id:
                  client.clientId,

                /*
                 * This client is currently being tested
                 * with PKCE and a public-client style flow.
                 *
                 * Therefore do not send client_secret here
                 * while token_endpoint_auth_method is "none".
                 */
                // client_secret:
                //   client.clientSecret,

                client_name:
                  client.name,

                redirect_uris:
                  client.redirectUris,

                response_types:
                  client.responseTypes,

                grant_types:
                  client.grantTypes,

                scope:
                  client.allowedScopes.join(' '),

                token_endpoint_auth_method:
                  client.tokenEndpointAuthMethod,
              },
            ],

            /*
             * OIDC ACCOUNT LOOKUP
             *
             * oidc-provider calls this after it has an
             * authenticated accountId in the OIDC session.
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
                await identityService.findById(
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

                  name:
                    user.username,

                  preferred_username:
                    user.username,

                  email:
                    user.email,

                  email_verified:
                    true,
                }),
              };
            },

            /*
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
            },

            /*
             * INTERACTION
             */
            interactions: {
              url(
                ctx,
                interaction,
              ) {
                return `/interaction/${interaction.uid}`;
              },
            },

            /*
             * SCOPES
             */
            scopes: [
              'openid',
              'profile',
              'email',
            ],

            /*
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
      },
    }),
  ],

  controllers: [
    OidcInteractionController,
  ],
})
export class OidcModule {}