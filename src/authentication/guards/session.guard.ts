import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { SessionsService } from '../../sessions/sessions.service';

@Injectable()
export class SessionGuard
  implements CanActivate
{
  constructor(
    private readonly sessionsService:
      SessionsService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<Request>();

    const sessionId =
      request.cookies?.idp_session;

    if (!sessionId) {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    const session =
      await this.sessionsService.getValidSession(
        sessionId,
      );

    if (!session) {
      throw new UnauthorizedException(
        'Invalid or expired session',
      );
    }

    request['session'] = session;

    return true;
  }
}