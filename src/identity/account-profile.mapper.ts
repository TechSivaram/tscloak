import { Client } from '../clients/entities/client.entity';
import { FederatedIdentity } from '../federation/entities/federated-identity.entity';
import { User } from './entities/user.entity';

export interface AccountProfile {
  username: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  federation: {
    providerName: string;
    providerType: string;
  } | null;
  client: {
    id: string;
    name: string;
  } | null;
  roles: string[];
}

export class AccountProfileMapper {
  static toResponse(
    user: User,
    client: Client | null,
    federatedIdentity: FederatedIdentity | null,
  ): AccountProfile {
    const profile = federatedIdentity?.profile;
    const name = this.stringClaim(profile?.name);
    const givenName = this.stringClaim(profile?.given_name);
    const familyName = this.stringClaim(profile?.family_name);
    const profileEmail = this.stringClaim(profile?.email);

    return {
      username: user.username,
      email: federatedIdentity?.email || profileEmail || user.email,
      displayName:
        name ||
        [givenName, familyName].filter(Boolean).join(' ') ||
        user.username,
      avatarUrl: this.safeAvatarUrl(profile?.picture),
      federation: federatedIdentity?.provider
        ? {
            providerName: federatedIdentity.provider.name,
            providerType: federatedIdentity.provider.type,
          }
        : null,
      client: client
        ? {
            id: client.clientId,
            name: client.name,
          }
        : null,
      roles: user.roles?.map((role) => role.name) ?? [],
    };
  }

  private static stringClaim(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private static safeAvatarUrl(value: unknown): string | null {
    const candidate = this.stringClaim(value);

    if (!candidate) {
      return null;
    }

    try {
      const url = new URL(candidate);
      return url.protocol === 'https:' && !url.username && !url.password
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }
}
