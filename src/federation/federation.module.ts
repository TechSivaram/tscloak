import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClientsModule } from 'src/clients/clients.module';
import { FederatedIdentity } from './entities/federated-identity.entity';
import { ClientFederationProvider } from './entities/client-federation-provider.entity';
import { FederationProvider } from './entities/federation-provider.entity';
import { FederationTransaction } from './entities/federation-transaction.entity';
import { FederationCryptoService } from './federation-crypto/federation-crypto.service';
import { FederationController } from './federation.controller';
import { FederationService } from './federation.service';
import { OidcFederationService } from './providers/oidc-federation/oidc-federation.service';
import { SecurityModule } from 'src/security/security.module';
import { IdentityModule } from 'src/identity/identity.module';
import { OidcModule } from 'src/oidc/oidc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FederationProvider,
      FederatedIdentity,
      FederationTransaction,
      ClientFederationProvider,
    ]),
    ClientsModule,
    IdentityModule,
    SecurityModule,
    forwardRef(() => OidcModule),
  ],
  providers: [
    FederationService,
    OidcFederationService,
    FederationCryptoService,
  ],
  exports: [TypeOrmModule, FederationService],
  controllers: [FederationController],
})
export class FederationModule {}
