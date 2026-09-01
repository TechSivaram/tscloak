import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SecurityPolicy } from './entities/security-policy.entity';
import { SecurityPolicyService } from './services/security-policy/security-policy.service';
import { SecurityPolicyAdminController } from './controllers/security-policy-admin/security-policy-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SecurityPolicy,
    ]),
  ],
  providers: [
    SecurityPolicyService,
  ],
  exports: [
    SecurityPolicyService,
  ],
  controllers: [SecurityPolicyAdminController],
})
export class SecurityModule {}