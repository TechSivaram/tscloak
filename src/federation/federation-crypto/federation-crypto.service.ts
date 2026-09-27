import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class FederationCryptoService {
  generateState(): string {
    return randomBytes(32).toString('base64url');
  }

  generateNonce(): string {
    return randomBytes(32).toString('base64url');
  }

  generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }
}
