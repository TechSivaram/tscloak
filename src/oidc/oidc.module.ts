import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OidcModule as NestOidcModule } from 'nest-oidc-provider';

import { OidcInteractionController } from './oidc-interaction/oidc-interaction.controller';

import { OidcPersistenceModule } from './oidc-persistence.module';

import { AuthenticationModule } from 'src/authentication/authentication.module';
import { ClientsModule } from 'src/clients/clients.module';
import { FederationModule } from 'src/federation/federation.module';
import { IdentityModule } from 'src/identity/identity.module';
import { MfaModule } from 'src/mfa/mfa.module';
import { SecurityModule } from 'src/security/security.module';
import { SigningKeysModule } from 'src/signing-keys/signing-keys.module';
import { OidcMfaChallenge } from './entities/oidc-mfa-challenge.entity';
import { ClientRegistrationPolicyModule } from './services/client-registration-policy/client-registration-policy.module';
import { OidcMfaChallengeService } from './services/oidc-mfa-challenge.service';
import { OidcOptionsService } from './services/oidc-options.service';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => FederationModule),

    AuthenticationModule,
    ClientsModule,
    IdentityModule,
    SecurityModule,
    OidcPersistenceModule,
    MfaModule,
    TypeOrmModule.forFeature([OidcMfaChallenge]),

    /**
     * Required by OidcOptionsService.
     */
    SigningKeysModule,
    ClientRegistrationPolicyModule,

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
        ClientRegistrationPolicyModule,
      ],

      useClass: OidcOptionsService,
    }),
  ],

  controllers: [OidcInteractionController],

  providers: [OidcOptionsService, OidcMfaChallengeService],

  exports: [OidcMfaChallengeService],
})
export class OidcModule {}
