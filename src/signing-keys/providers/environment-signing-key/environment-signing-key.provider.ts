import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SigningKeyProvider } from '../signing-key.provider'
import { PrivateJwks } from '../..//types/signing-key.types';

@Injectable()
export class EnvironmentSigningKeyProvider
  implements SigningKeyProvider
{
  constructor(
    private readonly config: ConfigService,
  ) {}

  getPrivateJwks(): PrivateJwks {
    const value =
      this.config.get<string>('OIDC_JWKS');

    if (!value) {
      throw new Error(
        'OIDC_JWKS environment variable is not configured',
      );
    }

    try {
      return JSON.parse(value) as PrivateJwks;
    } catch {
      throw new Error(
        'OIDC_JWKS contains invalid JSON',
      );
    }
  }
}