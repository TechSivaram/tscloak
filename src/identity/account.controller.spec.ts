jest.mock('src/security/guards/oidc-auth.guard', () => ({
  OidcAuthGuard: class OidcAuthGuard {},
}));

import { AccountController } from './account.controller';

describe('AccountController profile', () => {
  it('loads profile data only for the authenticated user and client scope', async () => {
    const user = {
      id: 'user-id',
      username: 'federated_local-name',
      email: 'fallback@example.test',
      roles: [{ name: 'USER' }],
    };
    const identity = {
      userId: 'user-id',
      email: 'federated@example.test',
      profile: { name: 'Federated Name' },
      provider: { name: 'Google', type: 'oidc' },
    };
    const identityService = {
      findById: jest.fn().mockResolvedValue(user),
    };
    const clientsService = {
      findByClientId: jest.fn().mockResolvedValue({
        clientId: 'client-public-id',
        name: 'Portal',
      }),
    };
    const federatedIdentities = {
      findOne: jest.fn().mockResolvedValue(identity),
    };
    const controller = new AccountController(
      identityService as never,
      clientsService as never,
      federatedIdentities as never,
    );

    const result = await controller.profile({
      user: {
        id: 'user-id',
        clientId: 'client-public-id',
        roles: [],
        accessToken: 'validated-token',
      },
    } as never);

    expect(identityService.findById).toHaveBeenCalledWith(
      'user-id',
      'client-public-id',
    );
    expect(federatedIdentities.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-id' },
        relations: { provider: true },
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
      }),
    );
    expect(result).toMatchObject({
      displayName: 'Federated Name',
      federation: { providerName: 'Google', providerType: 'oidc' },
      client: { id: 'client-public-id', name: 'Portal' },
    });
  });
});
