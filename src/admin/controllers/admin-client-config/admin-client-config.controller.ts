import {
  Controller,
  Get,
  NotFoundException,
  Query,
} from '@nestjs/common';

import { ClientsService } from 'src/clients/clients.service';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('admin/config')
@ApiTags('Portal Configuration')
export class AdminClientConfigController {
  constructor(
    private readonly clientsService: ClientsService,
  ) {}

  @Get('oidc')
  @ApiOperation({ summary: 'Resolve portal OIDC client configuration' })
  @ApiQuery({ name: 'portal', enum: ['admin', 'client-admin'], required: false })
  @ApiResponse({ status: 200, description: 'Public OIDC client configuration returned.' })
  @ApiResponse({ status: 404, description: 'Unknown portal or no enabled client.' })
  async getOidcClient(
    @Query('portal') portal: string = 'admin',
  ): Promise<{ clientId: string; redirectUri: string; postLogoutRedirectUri?: string }> {
    const callbackPath = portal === 'client-admin'
      ? '/client-admin/callback.html'
      : portal === 'admin'
        ? '/admin/callback.html'
        : null;

    if (!callbackPath) {
      throw new NotFoundException('Unknown admin portal');
    }

    const client = await this.clientsService.findClientForCallback(
      callbackPath,
    );

    if (!client || !client.enabled) {
      throw new NotFoundException(
        'No enabled client is registered for this redirect URI',
      );
    }

    return {
      clientId: client.clientId,
      redirectUri: client.redirectUris.find(uri => {
        try {
          return new URL(uri).pathname === callbackPath;
        } catch {
          return false;
        }
      }) ?? '',
      postLogoutRedirectUri: client.postLogoutRedirectUris?.find(uri => {
        try {
          return new URL(uri).pathname === `/${portal}`
            || new URL(uri).pathname === '/admin/'
            || new URL(uri).pathname === '/client-admin/';
        } catch {
          return false;
        }
      }),
    };
  }
}