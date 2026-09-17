import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientResponseDto } from './dto/client-response.dto';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { Roles } from 'src/security/decorators/roles.decorator';

@ApiTags('Clients')
@Controller('admin/clients')
@UseGuards(OidcAuthGuard, RolesGuard)
export class ClientsController {
  constructor(
    private readonly clientsService:
      ClientsService,
  ) {}

  @Get()
  @Roles('IDP_ADMIN')
  async findAll(): Promise<ClientResponseDto[]> {
    const clients = await this.clientsService.findAll();

    return clients.map(client => ({
      id: client.id,
      portalType: client.portalType,
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
    }));
  }

  @Post()
  @ApiOperation({
    summary: 'Register an OAuth/OIDC client',
    description:
      'Registers a new OAuth 2.0 / OpenID Connect client in TSCloak.',
  })
  @ApiResponse({
    status: 201,
    description:
      'OAuth/OIDC client registered successfully.',
    type: ClientResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid client registration data.',
  })
  @ApiResponse({
    status: 409,
    description:
      'A client with the same client ID or name already exists.',
  })
  async createClient(
    @Body() dto: CreateClientDto,
  ): Promise<ClientResponseDto> {
    const result =
      await this.clientsService.createClient(
        dto,
      );

    return {
      id: result.client.id,

      clientId:
        result.client.clientId,

      name:
        result.client.name,

      redirectUris:
        result.client.redirectUris,

      postLogoutRedirectUris:
        result.client.postLogoutRedirectUris ?? [],

      allowedScopes:
        result.client.allowedScopes,

      grantTypes:
        result.client.grantTypes,

      responseTypes:
        result.client.responseTypes,

      tokenEndpointAuthMethod:
        result.client.tokenEndpointAuthMethod,

      interactionMode:
        result.client.interactionMode,

      interactionLoginUrl:
        result.client.interactionLoginUrl ??
        undefined,

      interactionConsentUrl:
        result.client.interactionConsentUrl ??
        undefined,

      enabled:
        result.client.enabled,
    };
  }

  @Delete(':clientId')
  @Roles('IDP_ADMIN')
  async deleteClient(
    @Param('clientId') clientId: string,
  ): Promise<{ success: true }> {
    await this.clientsService.deleteByClientId(clientId);
    return { success: true };
  }

  @Put(':clientId')
  @Roles('IDP_ADMIN')
  async updateClient(
    @Param('clientId') clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    const client = await this.clientsService.updateClient(
      clientId,
      dto,
    );

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