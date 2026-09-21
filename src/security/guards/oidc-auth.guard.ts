import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { OidcTokenService } from '../services/oidc-token.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class OidcAuthGuard implements CanActivate {
  constructor(private readonly tokenService: OidcTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authorization = request.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header');
    }

    const tokenInfo = await this.tokenService.validate(token);

    request.user = {
      id: tokenInfo.sub,
      clientId: tokenInfo.clientId,
      roles: [],
      scope: tokenInfo.scope,
      accessToken: token,
    };

    return true;
  }
}
