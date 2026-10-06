import { Module, forwardRef } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ClientsModule } from '../clients/clients.module';
import { SecurityModule } from '../security/security.module';
import { SigningKeysModule } from '../signing-keys/signing-keys.module';
import { ScimAuthGuard } from './guards/scim-auth.guard';
import { ScimDiscoveryController } from './controllers/scim-discovery.controller';
import { ScimUserController } from './controllers/scim-user.controller';
import { ScimUserService } from './services/scim-user.service';

@Module({
  imports: [
    forwardRef(() => IdentityModule),
    forwardRef(() => ClientsModule),
    forwardRef(() => SecurityModule),
    SigningKeysModule,
  ],
  controllers: [ScimDiscoveryController, ScimUserController],
  providers: [ScimUserService, ScimAuthGuard],
  exports: [ScimAuthGuard],
})
export class ScimModule {}
