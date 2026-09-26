import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { SigningKeyService } from '../../signing-keys/services/signing-key/signing-key.service';

export interface ValidatedAccessToken {
  sub: string;
  clientId: string;
  scope?: string;
}

@Injectable()
export class OidcTokenService {
  constructor(
    private readonly signingKeyService: SigningKeyService,
    private readonly config: ConfigService,
  ) {}

  async validate(accessToken: string): Promise<ValidatedAccessToken> {
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    let jwtPayload: JWTPayload;

    try {
      const issuer =
        this.config.get<string>('OIDC_ISSUER') ?? 'http://localhost:3000';
      const jwks = createLocalJWKSet(this.signingKeyService.getPublicJwks());
      const verified = await jwtVerify(accessToken, jwks, {
        algorithms: ['RS256'],
        issuer,
        requiredClaims: ['exp', 'iat', 'jti', 'sub', 'client_id'],
      });

      if (verified.protectedHeader.typ !== 'at+jwt') {
        throw new Error('Unexpected JWT type');
      }

      jwtPayload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const sub = typeof jwtPayload.sub === 'string' ? jwtPayload.sub : undefined;
    const signedClientId =
      typeof jwtPayload.client_id === 'string'
        ? jwtPayload.client_id
        : undefined;
    const audiences = Array.isArray(jwtPayload.aud)
      ? jwtPayload.aud
      : typeof jwtPayload.aud === 'string'
        ? [jwtPayload.aud]
        : [];

    if (!sub || !signedClientId) {
      throw new UnauthorizedException('Access token has no account');
    }

    if (!audiences.includes(signedClientId)) {
      throw new UnauthorizedException('Access token has an invalid audience');
    }

    return {
      sub,

      clientId: signedClientId,

      scope:
        typeof jwtPayload.scope === 'string' ? jwtPayload.scope : undefined,
    };
  }
}
