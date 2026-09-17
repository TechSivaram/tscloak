import {
  Body,
  Controller,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { UpdateSecurityPolicyDto } from '../../dto/update-security-policy.dto';
import { SecurityPolicyService } from '../../services/security-policy/security-policy.service';

import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { Roles } from 'src/security/decorators/roles.decorator';

@ApiTags('Security Policy')
@Controller('admin/security-policy')
export class SecurityPolicyAdminController {
  constructor(
    private readonly securityPolicyService: SecurityPolicyService,
  ) {}

  /**
   * Get the current server-level security policy.
   *
   * This endpoint is public.
   */
  @Get()
  @ApiSecurity('')
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
   *
   * Requires:
   * - Valid OIDC access token
   * - IDP_ADMIN role
   */
  @Put()
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Update security policy',
    description:
      'Updates the server-level security policy. Only properties supplied in the request are updated. Requires the IDP_ADMIN role.',
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
  @ApiResponse({
    status: 401,
    description:
      'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 403,
    description:
      'Authenticated user does not have the IDP_ADMIN role.',
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