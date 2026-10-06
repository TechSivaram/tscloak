import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ClientsService } from '../../clients/clients.service';
import { SigningKeyService } from '../../signing-keys/services/signing-key/signing-key.service';

export type ScimRequest = Request & {
  scim?: { clientId: string; scope: string[]; payload: JWTPayload };
};

/**
 * Authenticates SCIM requests using a normal OAuth 2.0 access token issued by
 * TSCloak's existing client-credentials flow.
 *
 * The client authenticates at /token with its existing client_id/client_secret
 * and requests the `scim` scope. The resulting short-lived access token is
 * then sent to the SCIM endpoint as a Bearer token.
 */
@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly signingKeys: SigningKeyService,
    private readonly clients: ClientsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScimRequest>();
    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    let payload: JWTPayload;
    try {
      const issuer = this.config.get<string>('OIDC_ISSUER') ?? 'http://localhost:3000';
      const verified = await jwtVerify(
        token,
        createLocalJWKSet(this.signingKeys.getPublicJwks()),
        {
          algorithms: ['RS256'],
          issuer,
          requiredClaims: ['exp', 'iat', 'client_id', 'scope', 'aud'],
        },
      );
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired SCIM access token');
    }

    const clientId = typeof payload.client_id === 'string' ? payload.client_id : undefined;
    const scope = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [];
    const audience = Array.isArray(payload.aud) ? payload.aud : typeof payload.aud === 'string' ? [payload.aud] : [];

    if (!clientId || !scope.includes('scim')) {
      throw new UnauthorizedException('SCIM scope is required');
    }

    // The existing TSCloak resource-server configuration uses the client ID
    // as the audience for that client's API access token.
    if (!audience.includes(clientId)) {
      throw new UnauthorizedException('SCIM access token audience mismatch');
    }

    const client = await this.clients.findByClientId(clientId);
    if (!client || !client.enabled) {
      throw new UnauthorizedException('SCIM client is disabled or unavailable');
    }

    // The token must have been issued to a client that is explicitly allowed
    // to use the SCIM scope. This also protects against a misconfigured token.
    if (!(client.allowedScopes ?? []).includes('scim')) {
      throw new UnauthorizedException('SCIM is not enabled for this client');
    }

    if (!(client.grantTypes ?? []).includes('client_credentials')) {
      throw new UnauthorizedException('Client credentials grant is not enabled for this client');
    }

    request.scim = { clientId, scope, payload };
    return true;
  }
}
