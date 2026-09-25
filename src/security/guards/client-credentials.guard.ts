import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class ClientCredentialsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!user?.id || !user?.clientId) {
      throw new ForbiddenException(
        'Client credentials authentication required',
      );
    }

    if (user.id !== user.clientId) {
      throw new ForbiddenException(
        'This endpoint requires a client credentials token',
      );
    }

    return true;
  }
}
