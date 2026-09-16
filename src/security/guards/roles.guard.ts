import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import {
  ROLES_KEY,
} from '../decorators/roles.decorator';

import {
  AuthenticatedRequest,
} from '../types/authenticated-request';

import { IdentityService } from '../../identity/identity.service';

@Injectable()
export class RolesGuard
  implements CanActivate
{
  constructor(
    private readonly reflector: Reflector,
    private readonly identityService: IdentityService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    // ==========================================================
    // Get roles required by the endpoint
    // ==========================================================

    const requiredRoles =
      this.reflector.getAllAndOverride<
        string[]
      >(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    // If the endpoint does not specify @Roles(),
    // authentication is sufficient.
    if (
      !requiredRoles ||
      requiredRoles.length === 0
    ) {
      return true;
    }

    // ==========================================================
    // Get authenticated request
    // ==========================================================

    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const userId =
      request.user?.id;

    const clientId =
      request.user?.clientId;

    // ==========================================================
    // Validate authentication context
    // ==========================================================

    if (!userId) {
      throw new ForbiddenException(
        'Authenticated user not found',
      );
    }

    if (!clientId) {
      throw new ForbiddenException(
        'Authenticated client context not found',
      );
    }

    // ==========================================================
    // Load user for the authenticated client
    // ==========================================================

    const user =
      await this.identityService.findById(
        userId,
        clientId,
      );

    if (!user) {
      throw new ForbiddenException(
        'User does not belong to the authenticated client',
      );
    }

    // ==========================================================
    // Get current roles from database
    // ==========================================================

    const userRoles =
      user.roles?.map(
        (role) => role.name,
      ) ?? [];

    // ==========================================================
    // Check required roles
    // ==========================================================

    const hasRequiredRole =
      requiredRoles.some(
        (requiredRole) =>
          userRoles.includes(
            requiredRole,
          ),
      );

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        'Insufficient permissions',
      );
    }

    return true;
  }
}