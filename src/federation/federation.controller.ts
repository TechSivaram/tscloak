import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import type { Response } from 'express';
import { OidcService } from 'nest-oidc-provider';

import { CreateFederationProviderDto } from './dto/create-federation-provider.dto';
import { ClientFederationProviderResponseDto } from './dto/client-federation-provider-response.dto';
import { FederationProviderResponseDto } from './dto/federation-provider-response.dto';
import { UpdateFederationProviderDto } from './dto/update-federation-provider.dto';
import { UpdateClientFederationProviderDto } from './dto/update-client-federation-provider.dto';
import { FederationCryptoService } from './federation-crypto/federation-crypto.service';
import { FederationService } from './federation.service';
import { Roles } from '../security/decorators/roles.decorator';
import { OidcAuthGuard } from '../security/guards/oidc-auth.guard';
import { RolesGuard } from '../security/guards/roles.guard';
import type { AuthenticatedRequest } from '../security/types/authenticated-request';

@ApiTags('Federation')
@Controller('federation')
export class FederationController {
  private readonly logger = new Logger(FederationController.name);

  constructor(
    private readonly federationService: FederationService,
    private readonly federationCryptoService: FederationCryptoService,
    private readonly oidcService: OidcService,
  ) {}

  @Post('providers')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Create a federation provider',
    description: 'Registers an external identity provider for federation.',
  })
  @ApiCreatedResponse({
    description: 'Federation provider created successfully.',
    type: FederationProviderResponseDto,
  })
  async createProvider(
    @Body() dto: CreateFederationProviderDto,
  ): Promise<FederationProviderResponseDto> {
    const provider = await this.federationService.createProvider(dto);

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enabled: provider.enabled,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  @Get('providers')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'List federation providers',
    description:
      'Returns configured federation providers without client secrets.',
  })
  @ApiOkResponse({
    description: 'Federation providers retrieved successfully.',
    type: FederationProviderResponseDto,
    isArray: true,
  })
  async findAllProviders(): Promise<FederationProviderResponseDto[]> {
    const providers = await this.federationService.findAllProviders();

    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enabled: provider.enabled,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    }));
  }

  @Get('providers/:id')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Get a federation provider',
    description:
      'Returns a configured federation provider without its client secret.',
  })
  @ApiOkResponse({
    description: 'Federation provider retrieved successfully.',
    type: FederationProviderResponseDto,
  })
  async findProviderById(
    @Param('id') id: string,
  ): Promise<FederationProviderResponseDto> {
    const provider = await this.federationService.findProviderById(id);

    if (!provider) {
      throw new NotFoundException('Federation provider not found');
    }

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enabled: provider.enabled,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  @Patch('providers/:id')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Update a federation provider',
    description:
      'Updates a federation provider. If clientSecret is omitted, the existing secret is retained.',
  })
  @ApiOkResponse({
    description: 'Federation provider updated successfully.',
    type: FederationProviderResponseDto,
  })
  async updateProvider(
    @Param('id') id: string,
    @Body() dto: UpdateFederationProviderDto,
  ): Promise<FederationProviderResponseDto> {
    const provider = await this.federationService.updateProvider(id, dto);

    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      issuer: provider.issuer,
      clientId: provider.clientId,
      scopes: provider.scopes,
      enabled: provider.enabled,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  @Delete('providers/:id')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_ADMIN')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a federation provider',
    description: 'Deletes a federation provider and its federated identities.',
  })
  @ApiNoContentResponse({
    description: 'Federation provider deleted successfully.',
  })
  async deleteProvider(@Param('id') id: string): Promise<void> {
    await this.federationService.deleteProvider(id);
  }

  @Get('client/providers')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_CLIENT_ADMIN')
  @ApiOperation({
    summary: 'List federation availability for the authenticated client',
    description:
      'Returns provider names, types, and availability for the client bound to the access token. Shared provider configuration and credentials are not returned.',
  })
  @ApiOkResponse({
    description: 'Client federation availability returned.',
    type: ClientFederationProviderResponseDto,
    isArray: true,
  })
  async findClientProviders(
    @Req() request: AuthenticatedRequest,
  ): Promise<ClientFederationProviderResponseDto[]> {
    return this.federationService.findClientProviderOptions(
      request.user.clientId,
    );
  }

  @Patch('client/providers/:id')
  @UseGuards(OidcAuthGuard, RolesGuard)
  @Roles('IDP_CLIENT_ADMIN')
  @ApiOperation({
    summary: 'Set federation availability for the authenticated client',
    description:
      'Creates or updates only the provider availability override for the client bound to the access token.',
  })
  @ApiOkResponse({ description: 'Client federation availability updated.' })
  async setClientProviderEnabled(
    @Req() request: AuthenticatedRequest,
    @Param('id') providerId: string,
    @Body() dto: UpdateClientFederationProviderDto,
  ): Promise<{ id: string; enabled: boolean }> {
    await this.federationService.setClientProviderEnabled(
      request.user.clientId,
      providerId,
      dto,
    );

    return { id: providerId, enabled: dto.enabled };
  }

  @Get('providers/:id/authorize')
  @ApiOperation({
    summary: 'Start federation authorization',
    description:
      'Redirects the browser to the configured external OIDC provider.',
  })
  @ApiQuery({
    name: 'interaction_uid',
    required: true,
    description: 'UID of the pending local OIDC login interaction.',
  })
  async authorize(
    @Param('id') providerId: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('interaction_uid') interactionUid: string,
    @Res() response: Response,
  ): Promise<void> {
    if (!clientId || !redirectUri || !interactionUid) {
      throw new BadRequestException(
        'client_id, redirect_uri and interaction_uid are required',
      );
    }

    const provider = await this.federationService.findProviderById(providerId);

    if (
      !provider ||
      !(await this.federationService.isProviderEnabledForClient(
        providerId,
        clientId,
      ))
    ) {
      throw new NotFoundException('Federation provider not found');
    }

    const state = this.federationCryptoService.generateState();

    const nonce = this.federationCryptoService.generateNonce();

    const codeVerifier = this.federationCryptoService.generateCodeVerifier();

    const codeChallenge =
      this.federationCryptoService.generateCodeChallenge(codeVerifier);

    await this.federationService.createTransaction(
      provider.id,
      clientId,
      interactionUid,
      state,
      nonce,
      codeVerifier,
    );

    const authorizationUrl = await this.federationService.buildAuthorizationUrl(
      provider,
      state,
      nonce,
      codeChallenge,
    );

    response.redirect(authorizationUrl);
  }

  @Get('callback')
  @ApiOperation({
    summary: 'Handle federation callback',
    description:
      'Handles the authorization callback from an external OIDC provider.',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ): Promise<void> {
    let stage = 'validate callback code and state';

    try {
      if (!code || !state) {
        throw new BadRequestException('Missing authorization code or state');
      }

      stage = 'consume federation transaction by state';
      const transaction =
        await this.federationService.consumeTransaction(state);

      stage = 'load stored OIDC interaction by UID';
      const storedInteraction =
        await this.oidcService.provider.Interaction.find(
          transaction.interactionUid,
        );

      if (!storedInteraction) {
        throw new NotFoundException('OIDC interaction not found or expired');
      }

      stage = 'validate interaction UID and client binding';
      if (
        storedInteraction.uid !== transaction.interactionUid ||
        storedInteraction.params?.client_id !== transaction.clientId
      ) {
        throw new BadRequestException(
          'Federation transaction does not match the pending OIDC interaction',
        );
      }

      const provider = transaction.provider;

      stage = 'exchange upstream authorization code';
      const tokenResponse = await this.federationService.exchangeCode(
        provider,
        code,
        transaction.codeVerifier,
      );

      stage = 'extract upstream ID token';
      const idToken = tokenResponse['id_token'];

      if (typeof idToken !== 'string') {
        throw new BadRequestException(
          'Federation provider did not return an ID token',
        );
      }

      stage = 'verify upstream ID token signature and claims';
      const claims = await this.federationService.verifyIdToken(
        provider,
        idToken,
        transaction.nonce,
      );

      stage = 'find or create federated identity';
      const federatedIdentity =
        await this.federationService.findOrCreateFederatedIdentity(
          provider.id,
          transaction.clientId,
          claims,
        );

      stage = 'save login result to existing OIDC interaction';
      storedInteraction.result = {
        ...(storedInteraction.lastSubmission ?? {}),
        login: {
          accountId: federatedIdentity.userId,
          remember: true,
          ts: Math.floor(Date.now() / 1000),
        },
      };

      const interactionTtl =
        storedInteraction.exp - Math.floor(Date.now() / 1000);

      if (interactionTtl <= 0) {
        throw new BadRequestException('OIDC interaction has expired');
      }

      await storedInteraction.save(interactionTtl);

      stage = 'redirect browser to OIDC interaction resume route';
      response.status(303);
      response.setHeader('Location', storedInteraction.returnTo);
      response.setHeader('Content-Length', '0');
      response.end();
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(
          `Federation callback failed during: ${stage}: ${message}`,
          stack,
        );
      }

      throw error;
    }
  }
}
