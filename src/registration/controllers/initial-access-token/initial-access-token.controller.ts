import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { InitialAccessTokenService } from 'src/registration/services/initial-access-token/initial-access-token.service';
import { Roles } from 'src/security/decorators/roles.decorator';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';

@ApiTags('Initial Access Tokens')
@Controller('admin/initial-access-tokens')
@UseGuards(OidcAuthGuard, RolesGuard)
export class InitialAccessTokenController {
  constructor(
    private readonly initialAccessTokenService: InitialAccessTokenService,
  ) {}

  @Post()
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Create an initial access token',
    description:
      'Creates an initial access token that can be used for controlled OAuth/OIDC client registration. Requires the IDP_ADMIN role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Initial access token created successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user does not have the permission.',
  })
  async create() {
    return this.initialAccessTokenService.create();
  }

  @Get()
  @Roles('IDP_ADMIN')
  async findAll() {
    return this.initialAccessTokenService.findAll();
  }

  @Delete(':id')
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Revoke an initial access token',
    description:
      'Revokes an existing initial access token. Requires the IDP_ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'Identifier of the initial access token to revoke.',
    example: '8f7c2a31-5b64-4d91-9e3a-1c6f8b2d4a10',
  })
  @ApiResponse({
    status: 200,
    description: 'Initial access token revoked successfully.',
    schema: {
      example: {
        success: true,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
  })
  @ApiResponse({
    status: 403,
    description: 'Authenticated user does not have the permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Initial access token was not found.',
  })
  async revoke(@Param('id') id: string) {
    await this.initialAccessTokenService.revoke(id);

    return {
      success: true,
    };
  }
}
