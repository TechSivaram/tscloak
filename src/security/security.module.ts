import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecurityPolicy } from './entities/security-policy.entity';
import { SecurityPolicyService } from './services/security-policy/security-policy.service';
import { SecurityPolicyAdminController } from './controllers/security-policy-admin/security-policy-admin.controller';
import { OidcAuthGuard } from './guards/oidc-auth.guard';
import { OidcTokenService } from './services/oidc-token.service';
import { OidcPersistenceModule } from 'src/oidc/oidc-persistence.module';
import { RolesGuard } from './guards/roles.guard';
import { IdentityModule } from 'src/identity/identity.module';

@Module({
  imports: [
    OidcPersistenceModule,
    forwardRef(() => IdentityModule),
    TypeOrmModule.forFeature([
      SecurityPolicy,
    ]),
  ],
  providers: [
    SecurityPolicyService,
    OidcAuthGuard,
    OidcTokenService,
    RolesGuard,
  ],
  exports: [
    SecurityPolicyService,
    OidcAuthGuard,
    OidcTokenService,
    RolesGuard,
  ],
  controllers: [SecurityPolicyAdminController],
})
export class SecurityModule { }