import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class UserCredentialsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    if (!user?.id || !user?.clientId) {
      throw new ForbiddenException('User authentication is required');
    }

    if (user.id === user.clientId) {
      throw new ForbiddenException(
        'Client credentials tokens cannot change passwords',
      );
    }

    return true;
  }
}
