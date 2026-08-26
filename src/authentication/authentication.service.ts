import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import { IdentityService } from '../identity/identity.service';
import { User } from '../identity/entities/user.entity';

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly identityService: IdentityService,
  ) {}

  async authenticate(
    username: string,
    password: string,
  ): Promise<User> {
    const user =
      await this.identityService.findByUsername(
        username,
      );

    if (!user || !user.enabled) {
      throw new UnauthorizedException(
        'Invalid username or password',
      );
    }

    const validPassword =
      await argon2.verify(
        user.passwordHash,
        password,
      );

    if (!validPassword) {
      throw new UnauthorizedException(
        'Invalid username or password',
      );
    }

    return user;
  }
}