import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly users: UserRepository,
  ) {}

  async createUser(input: CreateUserInput): Promise<User> {
    const existingUsername =
      await this.users.findByUsername(input.username);

    if (existingUsername) {
      throw new ConflictException(
        'Username already exists',
      );
    }

    const existingEmail =
      await this.users.findByEmail(input.email);

    if (existingEmail) {
      throw new ConflictException(
        'Email already exists',
      );
    }

    const passwordHash = await argon2.hash(
      input.password,
    );

    const user = new User();

    user.username = input.username;
    user.email = input.email;
    user.passwordHash = passwordHash;
    user.enabled = true;

    return this.users.save(user);
  }

  async findByUsername(
    username: string,
  ): Promise<User | null> {
    return this.users.findByUsername(username);
  }
}