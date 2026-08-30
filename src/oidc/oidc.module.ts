import { Module } from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import {
  OidcModule as NestOidcModule,
} from 'nest-oidc-provider';

import { OidcInteractionController } from './oidc-interaction/oidc-interaction.controller';
import { OidcOptionsService } from './oidc-options.service';
import { OidcPersistenceModule } from './oidc-persistence.module';

import { AuthenticationModule } from 'src/authentication/authentication.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { ClientsModule } from 'src/clients/clients.module';
import { IdentityModule } from 'src/identity/identity.module';

@Module({
  imports: [
    ConfigModule,

    AuthenticationModule,
    SessionsModule,
    ClientsModule,
    IdentityModule,

    OidcPersistenceModule,

    NestOidcModule.forRootAsync({
      imports: [
        ConfigModule,
        ClientsModule,
        IdentityModule,
        OidcPersistenceModule,
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