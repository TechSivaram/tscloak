import { Module } from '@nestjs/common';

import { InitialAccessTokenController } from './controllers/initial-access-token/initial-access-token.controller';
import { InitialAccessTokenService } from './services/initial-access-token/initial-access-token.service';
import { SecurityModule } from 'src/security/security.module';
import { IdentityModule } from 'src/identity/identity.module';
import { OidcPersistenceModule } from 'src/oidc/oidc-persistence.module';

@Module({
  imports: [
    SecurityModule,
    IdentityModule,
    OidcPersistenceModule,
  ],
  controllers: [
    InitialAccessTokenController,
  ],
  providers: [
    InitialAccessTokenService,
  ],
  exports: [
    InitialAccessTokenService,
  ],
})
export class RegistrationModule {}