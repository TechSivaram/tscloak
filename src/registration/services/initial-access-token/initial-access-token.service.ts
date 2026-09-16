import { Injectable } from '@nestjs/common';
import { OidcService } from 'nest-oidc-provider';

@Injectable()
export class InitialAccessTokenService {
  constructor(
    private readonly oidcService: OidcService,
  ) { }

  async create() {
    const provider = this.oidcService.provider;

    const initialAccessToken =
      new provider.InitialAccessToken({
        policies: [
          'allowed-grant-types',
          'allowed-response-types',
          'allowed-scopes',
        ],
      });

    const token = await initialAccessToken.save();

    return {
      token,
    };
  }

  async revoke(id: string): Promise<void> {
    const provider = this.oidcService.provider;

    const initialAccessToken =
      await provider.InitialAccessToken.find(id);

    if (initialAccessToken) {
      await initialAccessToken.destroy();
    }
  }
}