import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface OidcProviderMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

@Injectable()
export class OidcFederationService {
  async discover(issuer: string): Promise<OidcProviderMetadata> {
    const discoveryUrl = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl);

    if (!response.ok) {
      throw new InternalServerErrorException(
        'Unable to discover OIDC provider metadata',
      );
    }

    return response.json() as Promise<OidcProviderMetadata>;
  }

  async buildAuthorizationUrl(
    issuer: string,
    clientId: string,
    scopes: string[],
    state: string,
    nonce: string,
    codeChallenge: string,
  ): Promise<string> {
    const metadata = await this.discover(issuer);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.getFederationCallbackUri(),
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `${metadata.authorization_endpoint}?${params.toString()}`;
  }

  async exchangeCode(
    issuer: string,
    clientId: string,
    clientSecret: string,
    code: string,
    codeVerifier: string,
  ): Promise<Record<string, unknown>> {
    const metadata = await this.discover(issuer);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: this.getFederationCallbackUri(),
      code_verifier: codeVerifier,
    });

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        'Unable to exchange federation authorization code',
      );
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async verifyIdToken(
    issuer: string,
    clientId: string,
    idToken: string,
    nonce: string,
  ): Promise<Record<string, unknown>> {
    const metadata = await this.discover(issuer);

    const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));

    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: metadata.issuer,
      audience: clientId,
    });

    if (payload.nonce !== nonce) {
      throw new InternalServerErrorException('Invalid OIDC nonce');
    }

    return payload;
  }

  private getFederationCallbackUri(): string {
    const issuer = process.env.OIDC_ISSUER;

    if (!issuer) {
      throw new InternalServerErrorException(
        'OIDC_ISSUER must be configured for federation callbacks',
      );
    }

    return `${issuer.replace(/\/$/, '')}/api/federation/callback`;
  }
}
