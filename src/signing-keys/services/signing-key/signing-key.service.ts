import {
  Inject,
  Injectable,
} from '@nestjs/common';

import { SIGNING_KEY_PROVIDER } from '../../providers/signing-key.provider';

import type { SigningKeyProvider } from '../../providers/signing-key.provider';

import type {
  PrivateJwks,
  PublicJwks,
  RsaPrivateJwk,
  RsaPublicJwk,
} from '../../types/signing-key.types';

@Injectable()
export class SigningKeyService {
  constructor(
    @Inject(SIGNING_KEY_PROVIDER)
    private readonly signingKeyProvider: SigningKeyProvider,
  ) {}

  /**
   * Gets validated private JWKS.
   *
   * This is used internally by the OIDC provider
   * for token signing.
   *
   * IMPORTANT:
   * Private key material must never be exposed
   * through an API.
   */
  getPrivateJwks(): PrivateJwks {
    const jwks =
      this.signingKeyProvider.getPrivateJwks();

    this.validatePrivateJwks(jwks);

    return jwks;
  }

  /**
   * Creates a public-only JWKS.
   *
   * Private key material is explicitly excluded.
   *
   * Safe for exposure through public JWKS endpoints.
   */
  getPublicJwks(): PublicJwks {
    const privateJwks =
      this.getPrivateJwks();

    return {
      keys: privateJwks.keys.map(
        (key): RsaPublicJwk => ({
          kty: key.kty,
          kid: key.kid,
          use: key.use ?? 'sig',
          alg: key.alg ?? 'RS256',
          n: key.n,
          e: key.e,
        }),
      ),
    };
  }

  /**
   * Validates the complete private JWKS.
   */
  private validatePrivateJwks(
    jwks: PrivateJwks,
  ): void {
    if (
      !jwks ||
      !Array.isArray(jwks.keys) ||
      jwks.keys.length === 0
    ) {
      throw new Error(
        'JWKS must contain at least one signing key',
      );
    }

    const kids = new Set<string>();

    for (const key of jwks.keys) {
      this.validatePrivateKey(
        key,
        kids,
      );
    }
  }

  /**
   * Validates a single RSA private JWK.
   */
  private validatePrivateKey(
    key: RsaPrivateJwk,
    kids: Set<string>,
  ): void {
    if (!key.kid) {
      throw new Error(
        'Every signing key must contain a kid',
      );
    }

    if (kids.has(key.kid)) {
      throw new Error(
        `Duplicate signing key kid: ${key.kid}`,
      );
    }

    kids.add(key.kid);

    if (key.kty !== 'RSA') {
      throw new Error(
        `Unsupported key type for ${key.kid}: ${key.kty}. Only RSA is supported.`,
      );
    }

    if (!key.n) {
      throw new Error(
        `Signing key ${key.kid} is missing public modulus n`,
      );
    }

    if (!key.e) {
      throw new Error(
        `Signing key ${key.kid} is missing public exponent e`,
      );
    }

    if (!key.d) {
      throw new Error(
        `Signing key ${key.kid} is missing private exponent d`,
      );
    }

    if (key.use && key.use !== 'sig') {
      throw new Error(
        `Signing key ${key.kid} must have use=sig`,
      );
    }

    if (key.alg && key.alg !== 'RS256') {
      throw new Error(
        `Unsupported algorithm for ${key.kid}: ${key.alg}. Only RS256 is supported.`,
      );
    }
  }
}