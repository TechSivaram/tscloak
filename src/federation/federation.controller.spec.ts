import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { OidcService } from 'nest-oidc-provider';

import { FederationController } from './federation.controller';
import { FederationCryptoService } from './federation-crypto/federation-crypto.service';
import { FederationService } from './federation.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('./federation.service', () => ({
  FederationService: class FederationService {},
}));
jest.mock('../security/guards/oidc-auth.guard', () => ({
  OidcAuthGuard: class OidcAuthGuard {},
}));
jest.mock('../security/guards/roles.guard', () => ({
  RolesGuard: class RolesGuard {},
}));
jest.mock('../security/decorators/roles.decorator', () => ({
  Roles: () => () => undefined,
}));

describe('FederationController callback', () => {
  const now = Math.floor(Date.now() / 1000);
  const storedInteraction = {
    uid: 'interaction-uid',
    params: { client_id: 'downstream-client' },
    lastSubmission: { consent: { grantId: 'existing-grant' } },
    exp: now + 120,
    returnTo: '/auth/interaction-uid',
    save: jest.fn().mockResolvedValue(undefined),
  };
  const transaction = {
    interactionUid: 'interaction-uid',
    clientId: 'downstream-client',
    codeVerifier: 'pkce-verifier',
    nonce: 'nonce-value',
    provider: { id: 'federation-provider' },
  };
  const response = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn(),
  } as unknown as Response;
  const federationService = {
    consumeTransaction: jest.fn().mockResolvedValue(transaction),
    exchangeCode: jest.fn().mockResolvedValue({ id_token: 'id-token' }),
    verifyIdToken: jest.fn().mockResolvedValue({ sub: 'google-subject' }),
    findOrCreateFederatedIdentity: jest
      .fn()
      .mockResolvedValue({ userId: 'local-user-id' }),
  } as unknown as FederationService;
  const oidcService = {
    provider: {
      Interaction: {
        find: jest.fn().mockResolvedValue(storedInteraction),
      },
    },
  } as unknown as OidcService;

  let controller: FederationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FederationController(
      federationService,
      {} as FederationCryptoService,
      oidcService,
    );
  });

  it('saves login on the persisted interaction and redirects to its resume route', async () => {
    await controller.callback('upstream-code', 'state-value', response);

    expect(oidcService.provider.Interaction.find).toHaveBeenCalledWith(
      transaction.interactionUid,
    );
    expect(storedInteraction.result).toEqual({
      ...storedInteraction.lastSubmission,
      login: {
        accountId: 'local-user-id',
        remember: true,
        ts: expect.any(Number),
      },
    });
    expect(storedInteraction.save).toHaveBeenCalledWith(expect.any(Number));
    expect(response.status).toHaveBeenCalledWith(303);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      storedInteraction.returnTo,
    );
    expect(response.end).toHaveBeenCalled();
  });

  it('rejects an interaction belonging to a different OIDC client', async () => {
    storedInteraction.params.client_id = 'another-client';

    await expect(
      controller.callback('upstream-code', 'state-value', response),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(federationService.exchangeCode).not.toHaveBeenCalled();
    storedInteraction.params.client_id = transaction.clientId;
  });
});

describe('FederationController administration', () => {
  const provider = {
    id: 'provider-id',
    name: 'Google',
    type: 'oidc',
    issuer: 'https://accounts.google.com',
    clientId: 'upstream-client-id',
    clientSecret: 'never-return-this-secret',
    scopes: ['openid', 'profile', 'email'],
    enabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  let service: Record<string, jest.Mock>;
  let controller: FederationController;

  beforeEach(() => {
    service = {
      createProvider: jest.fn().mockResolvedValue(provider),
      findAllProviders: jest.fn().mockResolvedValue([provider]),
      findProviderById: jest.fn().mockResolvedValue(provider),
      updateProvider: jest.fn().mockResolvedValue(provider),
      deleteProvider: jest.fn().mockResolvedValue(undefined),
      findClientProviderOptions: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'provider-id',
            name: 'Google',
            type: 'oidc',
            enabled: true,
            availableGlobally: true,
          },
        ]),
      setClientProviderEnabled: jest.fn().mockResolvedValue(undefined),
      isProviderEnabledForClient: jest.fn().mockResolvedValue(true),
    };
    controller = new FederationController(
      service as unknown as FederationService,
      {} as FederationCryptoService,
      {} as OidcService,
    );
  });

  it('supports IDP Admin provider CRUD while never returning a secret', async () => {
    const createDto = {
      name: 'Google',
      type: 'oidc',
      issuer: provider.issuer,
      clientId: provider.clientId,
      clientSecret: 'new-secret',
      scopes: provider.scopes,
    };

    expect(await controller.findAllProviders()).toEqual([
      {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        issuer: provider.issuer,
        clientId: provider.clientId,
        scopes: provider.scopes,
        enabled: provider.enabled,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt,
      },
    ]);
    expect(await controller.createProvider(createDto)).not.toHaveProperty(
      'clientSecret',
    );
    expect(await controller.findProviderById(provider.id)).not.toHaveProperty(
      'clientSecret',
    );
    expect(
      await controller.updateProvider(provider.id, { enabled: false }),
    ).not.toHaveProperty('clientSecret');
    await controller.deleteProvider(provider.id);
    expect(service.createProvider).toHaveBeenCalledWith(createDto);
    expect(service.updateProvider).toHaveBeenCalledWith(provider.id, {
      enabled: false,
    });
    expect(service.deleteProvider).toHaveBeenCalledWith(provider.id);
  });

  it('uses the authenticated client for availability reads and updates', async () => {
    const request = {
      user: {
        clientId: 'authenticated-client',
        id: 'admin-user',
        roles: ['IDP_CLIENT_ADMIN'],
      },
    };

    await expect(
      controller.findClientProviders(request as never),
    ).resolves.toEqual([
      {
        id: 'provider-id',
        name: 'Google',
        type: 'oidc',
        enabled: true,
        availableGlobally: true,
      },
    ]);
    await expect(
      controller.setClientProviderEnabled(request as never, 'provider-id', {
        enabled: false,
      }),
    ).resolves.toEqual({ id: 'provider-id', enabled: false });

    expect(service.findClientProviderOptions).toHaveBeenCalledWith(
      'authenticated-client',
    );
    expect(service.setClientProviderEnabled).toHaveBeenCalledWith(
      'authenticated-client',
      'provider-id',
      { enabled: false },
    );
  });

  it('does not start authorization for a provider disabled for the requesting client', async () => {
    service.isProviderEnabledForClient.mockResolvedValue(false);
    const authorizeResponse = {
      redirect: jest.fn(),
    } as unknown as Response;

    await expect(
      controller.authorize(
        'provider-id',
        'client-a',
        'https://app.example.test/callback',
        'interaction-uid',
        authorizeResponse,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(service.isProviderEnabledForClient).toHaveBeenCalledWith(
      'provider-id',
      'client-a',
    );
    expect(authorizeResponse.redirect).not.toHaveBeenCalled();
  });
});
