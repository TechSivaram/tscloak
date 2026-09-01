import { Module } from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import {
  OidcModule as NestOidcModule,
} from 'nest-oidc-provider';

import { OidcInteractionController } from './oidc-interaction/oidc-interaction.controller';

import { OidcPersistenceModule } from './oidc-persistence.module';

import { AuthenticationModule } from 'src/authentication/authentication.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { ClientsModule } from 'src/clients/clients.module';
import { IdentityModule } from 'src/identity/identity.module';
import { SigningKeysModule } from 'src/signing-keys/signing-keys.module';
import { OidcOptionsService } from './services/oidc-options.service';
import { SecurityModule } from 'src/security/security.module';

@Module({
  imports: [
    ConfigModule,

    AuthenticationModule,
    SessionsModule,
    ClientsModule,
    IdentityModule,
    SecurityModule,
    OidcPersistenceModule,

    /**
     * Required by OidcOptionsService.
     */
    SigningKeysModule,

    NestOidcModule.forRootAsync({
      /**
       * IMPORTANT:
       *
       * These imports belong to the dynamic OIDC module
       * where OidcOptionsService is instantiated.
       */
      imports: [
        ConfigModule,
        ClientsModule,
        IdentityModule,
        OidcPersistenceModule,
        SigningKeysModule,
        SecurityModule,
      ],

      useClass: OidcOptionsService,
    }),
  ],

  controllers: [
    OidcInteractionController,
  ],

  providers: [
    OidcOptionsService,
  ],
})
export class OidcModule {}