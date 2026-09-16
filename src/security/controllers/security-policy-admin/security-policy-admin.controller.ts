import {
  Body,
  Controller,
  Get,
  Put,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { UpdateSecurityPolicyDto } from '../../dto/update-security-policy.dto';
import { SecurityPolicyService } from '../../services/security-policy/security-policy.service';

@ApiTags('Security Policy')
@Controller('admin/security-policy')
export class SecurityPolicyAdminController {
  constructor(
    private readonly securityPolicyService:
      SecurityPolicyService,
  ) {}

  /**
   * Get the current server-level security policy.
   */
  @Get()
  @ApiOperation({
    summary: 'Get security policy',
    description:
      'Returns the current server-level security policy used by TSCloak for token, refresh token, session, interaction, and registration token lifetimes.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Current server-level security policy.',
  })
  async getPolicy() {
    return this.securityPolicyService.getPolicy();
  }

  /**
   * Update the current server-level security policy.
   */
  @Put()
  @ApiOperation({
    summary: 'Update security policy',
    description:
      'Updates the server-level security policy. Only properties supplied in the request are updated.',
  })
  @ApiBody({
    type: UpdateSecurityPolicyDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'Security policy updated successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid security policy values.',
  })
  async updatePolicy(
    @Body()
    updateSecurityPolicyDto: UpdateSecurityPolicyDto,
  ) {
    return this.securityPolicyService.updatePolicy(
      updateSecurityPolicyDto,
    );
  }
}