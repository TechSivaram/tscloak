import { Module } from '@nestjs/common';
import { ClientRegistrationPolicyService } from './client-registration-policy.service';

@Module({
  providers: [ClientRegistrationPolicyService],
  exports: [ClientRegistrationPolicyService],
})
export class ClientRegistrationPolicyModule {}