import { Injectable } from '@nestjs/common';

import { ClientsService } from 'src/clients/clients.service';
import { IdentityService } from 'src/identity/identity.service';
import { InitialAccessTokenService } from 'src/registration/services/initial-access-token/initial-access-token.service';
import { SecurityPolicyService } from 'src/security/services/security-policy/security-policy.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly clients: ClientsService,
    private readonly identity: IdentityService,
    private readonly initialAccessTokens: InitialAccessTokenService,
    private readonly securityPolicy: SecurityPolicyService,
  ) {}

  async getDashboard() {
    const [
      clients,
      users,
      initialAccessTokens,
      roles,
      securityPolicy,
    ] = await Promise.all([
      this.clients.count(),
      this.identity.countUsers(),
      this.initialAccessTokens.count(),
      this.identity.countRoles(),
      this.securityPolicy.getPolicy(),
    ]);

    return {
      clients,
      users,
      initialAccessTokens,
      roles,
      generatedAt: new Date().toISOString(),
      status: {
        oidcProvider: 'Operational',
        database: 'Connected',
        registration: 'Operational',
        securityPolicy: securityPolicy
          ? 'Active'
          : 'Unavailable',
      },
    };
  }
}