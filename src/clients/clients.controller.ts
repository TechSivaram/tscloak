import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ClientResponseDto } from './dto/client-response.dto';

@ApiTags('Clients')
@Controller('admin/clients')
export class ClientsController {
  constructor(
    private readonly clientsService:
      ClientsService,
  ) {}

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
}