import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';

import { ClientsService } from './clients.service';
import { UpdateClientSettingsDto } from './dto/update-client-settings.dto';
import { ClientResponseDto } from './dto/client-response.dto';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { Roles } from 'src/security/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/security/types/authenticated-request';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@Controller('client-admin/settings')
@UseGuards(OidcAuthGuard, RolesGuard)
@ApiTags('Client Admin Settings')
export class ClientAdminSettingsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles('IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'Get client-admin client settings' })
  @ApiResponse({
    status: 200,
    description: 'Current client settings returned.',
  })
  @ApiResponse({
    status: 403,
    description: 'Caller is not an IDP_CLIENT_ADMIN.',
  })
  async get(@Req() request: AuthenticatedRequest): Promise<ClientResponseDto> {
    return this.toResponse(
      await this.clientsService.findByClientId(request.user.clientId ?? ''),
    );
  }

  @Put()
  @Roles('IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'Update client-admin client settings' })
  @ApiResponse({ status: 200, description: 'Client settings updated.' })
  @ApiResponse({ status: 400, description: 'Invalid client settings.' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not an IDP_CLIENT_ADMIN.',
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateClientSettingsDto,
  ): Promise<ClientResponseDto> {
    return this.toResponse(
      await this.clientsService.updateClient(request.user.clientId ?? '', dto),
    );
  }

  private toResponse(client: any): ClientResponseDto {
    if (!client) throw new NotFoundException('Client not found');
    return {
      id: client.id,
      clientId: client.clientId,
      name: client.name,
      redirectUris: client.redirectUris,
      postLogoutRedirectUris: client.postLogoutRedirectUris ?? [],
      allowedScopes: client.allowedScopes,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      interactionMode: client.interactionMode,
      interactionLoginUrl: client.interactionLoginUrl ?? undefined,
      interactionConsentUrl: client.interactionConsentUrl ?? undefined,
      enabled: client.enabled,
    };
  }
}
