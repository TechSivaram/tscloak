import { Injectable } from '@nestjs/common';
import { OidcService } from 'nest-oidc-provider';

@Injectable()
export class InitialAccessTokenService {
  constructor(
    private readonly oidcService: OidcService,
  ) {}

  async create() {
    const provider = this.oidcService.provider;

    const initialAccessToken =
      new provider.InitialAccessToken({});

    const token = await initialAccessToken.save();

    return {
      token,
    };
  }
}