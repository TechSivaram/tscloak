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
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService:
      ClientsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Register an OAuth/OIDC client',
  })
  @ApiResponse({
    status: 201,
    type: ClientResponseDto,
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
      clientId: result.client.clientId,
      name: result.client.name,
      redirectUris:
        result.client.redirectUris,
      allowedScopes:
        result.client.allowedScopes,
      grantTypes:
        result.client.grantTypes,
      responseTypes:
        result.client.responseTypes,
      tokenEndpointAuthMethod:
        result.client.tokenEndpointAuthMethod,
      enabled: result.client.enabled,
      clientSecret:
        result.clientSecret ?? undefined,
    };
  }
}