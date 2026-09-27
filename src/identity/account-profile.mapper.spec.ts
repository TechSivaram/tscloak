import { AccountProfileMapper } from './account-profile.mapper';
import { Client } from '../clients/entities/client.entity';
import { FederatedIdentity } from '../federation/entities/federated-identity.entity';
import { User } from './entities/user.entity';

describe('AccountProfileMapper', () => {
  const user = {
    id: 'user-1',
    username: 'federated_generated-account',
    email: 'local@example.test',
    roles: [{ name: 'USER' }],
  } as User;
  const client = {
    id: 'internal-client-id',
    clientId: 'public-client-id',
    name: 'Customer Portal',
    clientSecret: 'must-not-be-exposed',
  } as Client;

  it('uses the Google name, picture, email, provider and associated client safely', () => {
    const identity = {
      email: 'provider@example.test',
      profile: {
        name: 'Taylor User',
        picture: 'https://images.example.test/avatar.png',
        given_name: 'Taylor',
        family_name: 'User',
        email: 'claim@example.test',
        access_token: 'must-not-be-exposed',
      },
      provider: {
        name: 'Google',
        type: 'oidc',
        issuer: 'must-not-be-exposed',
        clientSecret: 'must-not-be-exposed',
      },
    } as FederatedIdentity;

    expect(AccountProfileMapper.toResponse(user, client, identity)).toEqual({
      username: 'federated_generated-account',
      email: 'provider@example.test',
      displayName: 'Taylor User',
      avatarUrl: 'https://images.example.test/avatar.png',
      federation: { providerName: 'Google', providerType: 'oidc' },
      client: { id: 'public-client-id', name: 'Customer Portal' },
      roles: ['USER'],
    });
  });

  it('preserves the Google picture URL supplied from federated identity profile data', () => {
    const picture =
      'https://lh3.googleusercontent.com/a/ACg8ocL6c7lm5r_AeeUnJD3RgDBHClw_WZQGGA_nsQC4ZPFxYB1NaD_r=s96-c';
    const identity = {
      email: 'provider@example.test',
      profile: { picture },
      provider: { name: 'Google', type: 'oidc' },
    } as FederatedIdentity;

    expect(AccountProfileMapper.toResponse(user, client, identity).avatarUrl).toBe(
      picture,
    );
  });

  it('uses given and family names when the provider name is absent', () => {
    const identity = {
      email: null,
      profile: { given_name: 'Jordan', family_name: 'Lee' },
      provider: { name: 'Google', type: 'oidc' },
    } as FederatedIdentity;

    expect(
      AccountProfileMapper.toResponse(user, client, identity).displayName,
    ).toBe('Jordan Lee');
  });

  it('falls back to the local username and email when profile data is absent', () => {
    const identity = {
      email: null,
      profile: { picture: 'javascript:alert(1)' },
      provider: { name: 'Google', type: 'oidc' },
    } as FederatedIdentity;

    expect(
      AccountProfileMapper.toResponse(user, client, identity),
    ).toMatchObject({
      username: 'federated_generated-account',
      displayName: 'federated_generated-account',
      email: 'local@example.test',
      avatarUrl: null,
    });
  });

  it('preserves local-user presentation when there is no federation identity', () => {
    expect(AccountProfileMapper.toResponse(user, client, null)).toEqual({
      username: 'federated_generated-account',
      email: 'local@example.test',
      displayName: 'federated_generated-account',
      avatarUrl: null,
      federation: null,
      client: { id: 'public-client-id', name: 'Customer Portal' },
      roles: ['USER'],
    });
  });

  it('rejects non-HTTPS avatar URLs and does not expose provider fields or raw claims', () => {
    const identity = {
      email: 'provider@example.test',
      profile: {
        picture: 'http://images.example.test/avatar.png',
        sub: 'hidden',
      },
      provider: {
        name: 'Google',
        type: 'oidc',
        clientId: 'hidden',
        clientSecret: 'hidden',
      },
    } as FederatedIdentity;
    const result = AccountProfileMapper.toResponse(user, client, identity);

    expect(result.avatarUrl).toBeNull();
    expect(JSON.stringify(result)).not.toContain('hidden');
    expect(JSON.stringify(result)).not.toContain('must-not-be-exposed');
    expect(Object.keys(result).sort()).toEqual(
      [
        'avatarUrl',
        'client',
        'displayName',
        'email',
        'federation',
        'roles',
        'username',
      ].sort(),
    );
  });
});
