import { Module } from '@nestjs/common';
import { ProvidersModule } from 'src/providers/providers.module';

import { IdentityModule } from 'src/identity/identity.module';
import { OidcPersistenceModule } from 'src/oidc/oidc-persistence.module';
import { SecurityModule } from 'src/security/security.module';
import { InitialAccessTokenController } from './controllers/initial-access-token/initial-access-token.controller';
import { InitialAccessTokenService } from './services/initial-access-token/initial-access-token.service';

@Module({
  imports: [
    SecurityModule,
    IdentityModule,
    OidcPersistenceModule,
    ProvidersModule,
  ],
  controllers: [InitialAccessTokenController],
  providers: [InitialAccessTokenService],
  exports: [InitialAccessTokenService],
})
export class RegistrationModule {}
