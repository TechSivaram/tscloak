import {
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';

import { UpdateSecurityPolicyDto } from '../../dto/update-security-policy.dto';
import { SecurityPolicyService } from '../../services/security-policy/security-policy.service';

@Controller('admin/security-policy')
export class SecurityPolicyAdminController {
  constructor(
    private readonly securityPolicyService: SecurityPolicyService,
  ) {}

  /**
   * Get the current server-level security policy.
   */
  @Get()
  async getPolicy() {
    return this.securityPolicyService.getPolicy();
  }

  /**
   * Update the current server-level security policy.
   */
  @Put()
  async updatePolicy(
    @Body() updateSecurityPolicyDto: UpdateSecurityPolicyDto,
  ) {
    return this.securityPolicyService.updatePolicy(
      updateSecurityPolicyDto,
    );
  }
}