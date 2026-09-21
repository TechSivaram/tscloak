import { Injectable, UnauthorizedException } from '@nestjs/common';

import * as argon2 from 'argon2';

import { IdentityService } from '../identity/identity.service';
import { User } from '../identity/entities/user.entity';
import { ClientsService } from '../clients/clients.service';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly identityService: IdentityService,
    private readonly clientsService: ClientsService,
  ) {}

  async authenticate(
    username: string,
    password: string,
    client_id: string,
  ): Promise<User> {
    const user = await this.identityService.findByUsername(username, client_id);

    if (!user || !user.enabled) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const validPassword = await argon2.verify(user.passwordHash, password);

    if (!validPassword) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const requiredRole =
      await this.clientsService.requiredRoleForClient(client_id);

    if (
      requiredRole &&
      !user.roles?.some((role) => role.name === requiredRole)
    ) {
      throw new UnauthorizedException(
        'User is not allowed to access this portal',
      );
    }

    return user;
  }
}
