import { Injectable } from '@nestjs/common';
import { OidcService } from 'nest-oidc-provider';
import { OidcRepository } from 'src/oidc/repositories/oidc.repository';
import { MailService } from 'src/providers/mail/mail.service';

@Injectable()
export class InitialAccessTokenService {
  constructor(
    private readonly oidcService: OidcService,
    private readonly oidcRepository: OidcRepository,
    private readonly mailService: MailService,
  ) {}

  async create(email?: string) {
    const provider = this.oidcService.provider;

    const initialAccessToken = new provider.InitialAccessToken({
      policies: [
        'allowed-grant-types',
        'allowed-response-types',
        'allowed-scopes',
      ],
    });

    const token = await initialAccessToken.save();

    if (email) {
      await this.mailService.sendInitialAccessTokenEmail(email, token);
    }

    return {
      token,
    };
  }

  async count(): Promise<number> {
    return this.oidcRepository.countByModel('InitialAccessToken');
  }

  async findAll() {
    const records =
      await this.oidcRepository.findAllByModel('InitialAccessToken');

    return records.map((record) => ({
      id: record.id,
      policies: Array.isArray(record.payload.policies)
        ? record.payload.policies
        : [],
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  }

  async revoke(id: string): Promise<void> {
    const provider = this.oidcService.provider;

    const initialAccessToken = await provider.InitialAccessToken.find(id);

    if (initialAccessToken) {
      await initialAccessToken.destroy();
    }
  }
}
