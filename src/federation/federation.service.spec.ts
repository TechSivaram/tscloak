import { BadRequestException } from '@nestjs/common';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));
jest.mock('./providers/oidc-federation/oidc-federation.service', () => ({
  OidcFederationService: class OidcFederationService {},
}));

import { FederationService } from './federation.service';

describe('FederationService client provider availability', () => {
  const globalProvider = {
    id: 'provider-id',
    name: 'Google',
    type: 'oidc',
    enabled: true,
    issuer: 'https://accounts.google.com',
    clientId: 'upstream-client-id',
    clientSecret: 'secret-must-not-leak',
    scopes: ['openid', 'profile', 'email'],
  };
  const client = {
    id: 'database-client-a',
    clientId: 'client-a',
    enabled: true,
  };
  let providerRepository: Record<string, jest.Mock>;
  let clientProviderRepository: Record<string, jest.Mock>;
  let clientsService: Record<string, jest.Mock>;
  let service: FederationService;

  beforeEach(() => {
    providerRepository = {
      find: jest.fn().mockResolvedValue([globalProvider]),
      findOne: jest.fn().mockResolvedValue(globalProvider),
      save: jest.fn().mockImplementation(async (provider) => provider),
    };
    clientProviderRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    clientsService = {
      findByClientId: jest.fn().mockResolvedValue(client),
    };
    service = new FederationService(
      providerRepository as never,
      {} as never,
      {} as never,
      clientProviderRepository as never,
      {} as never,
      clientsService as never,
      {} as never,
    );
  });

  it('inherits enabled global providers unless this client has disabled an override', async () => {
    clientProviderRepository.find.mockResolvedValue([
      { providerId: 'provider-id', enabled: false },
    ]);

    await expect(
      service.findEnabledProviderOptions('client-a'),
    ).resolves.toEqual([]);
    expect(clientProviderRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'database-client-a' } }),
    );
  });

  it('keeps legacy global availability for a client without an override', async () => {
    providerRepository.find.mockResolvedValue([
      { id: 'provider-id', name: 'Google' },
    ]);
    await expect(
      service.findEnabledProviderOptions('client-a'),
    ).resolves.toEqual([{ id: 'provider-id', name: 'Google' }]);
  });

  it('returns only safe global provider labels and this client availability', async () => {
    const result = await service.findClientProviderOptions('client-a');

    expect(result).toEqual([
      {
        id: 'provider-id',
        name: 'Google',
        type: 'oidc',
        availableGlobally: true,
        enabled: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-must-not-leak');
    expect(clientProviderRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'database-client-a' } }),
    );
  });

  it('preserves the shared secret when an update omits clientSecret', async () => {
    const existingProvider = { ...globalProvider };
    providerRepository.findOne.mockResolvedValue(existingProvider);

    await service.updateProvider('provider-id', { name: 'Google Updated' });

    expect(existingProvider.clientSecret).toBe('secret-must-not-leak');
    expect(providerRepository.save).toHaveBeenCalledWith(existingProvider);
  });

  it('writes an availability override only for the resolved authenticated client', async () => {
    await service.setClientProviderEnabled('client-a', 'provider-id', {
      enabled: false,
    });

    expect(clientProviderRepository.create).toHaveBeenCalledWith({
      clientId: 'database-client-a',
      providerId: 'provider-id',
      enabled: false,
    });
    expect(clientProviderRepository.save).toHaveBeenCalledWith({
      clientId: 'database-client-a',
      providerId: 'provider-id',
      enabled: false,
    });
  });

  it('keeps another client on its own availability scope', async () => {
    clientsService.findByClientId.mockImplementation(
      async (clientId: string) =>
        clientId === 'client-a'
          ? client
          : { id: 'database-client-b', clientId: 'client-b', enabled: true },
    );
    clientProviderRepository.find.mockImplementation(async (options) =>
      options.where.clientId === 'database-client-a'
        ? [{ providerId: 'provider-id', enabled: false }]
        : [],
    );

    await expect(
      service.findClientProviderOptions('client-a'),
    ).resolves.toMatchObject([{ enabled: false }]);
    await expect(
      service.findClientProviderOptions('client-b'),
    ).resolves.toMatchObject([{ enabled: true }]);
    expect(clientProviderRepository.find).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { clientId: 'database-client-b' } }),
    );
  });

  it('does not allow a client to enable a globally disabled provider', async () => {
    providerRepository.findOne.mockResolvedValue({
      ...globalProvider,
      enabled: false,
    });

    await expect(
      service.setClientProviderEnabled('client-a', 'provider-id', {
        enabled: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(clientProviderRepository.save).not.toHaveBeenCalled();
  });

  it('checks availability against the requested client override', async () => {
    clientProviderRepository.findOne.mockResolvedValue({ enabled: false });

    await expect(
      service.isProviderEnabledForClient('provider-id', 'client-a'),
    ).resolves.toBe(false);
    expect(clientProviderRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: 'database-client-a', providerId: 'provider-id' },
      }),
    );
  });
});
