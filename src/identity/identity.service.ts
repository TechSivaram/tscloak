import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { RoleRepository } from './repositories/role.repository';
import { Role } from './entities/role.entity';
import { ClientRepository } from 'src/clients/repositories/client.repository';

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  clientId: string;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly clients: ClientRepository,
  ) { }

  async createUser(input: CreateUserInput): Promise<User> {

    if(!input.clientId) {
      throw new BadRequestException(
        'Client ID is required',
      );
    }

    var clnt = await this.clients.findByClientId(input.clientId)
    if(clnt === null) {
      throw new ConflictException(
        'Client does not exist',
      );
    }

    input.clientId = clnt.id;
    const existingUsername =
      await this.users.findByUsername(input.username, input.clientId);

    if (existingUsername) {
      throw new ConflictException(
        'Username already exists',
      );
    }

    const existingEmail =
      await this.users.findByEmail(input.email, input.clientId);

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
    user.clientId = input.clientId;

    return this.users.save(user);
  }

  async findByUsername(
    username: string, client_id: any,
  ): Promise<User | null> {
    return this.users.findByUsername(username, client_id);
  }

  async findById(
    id: string,
    client_id: any,
  ): Promise<User | null> {
    return this.users.findById(id, client_id);
  }


  async createRole(
    name: string,
    description?: string,
  ): Promise<Role> {
    const existingRole =
      await this.roles.findByName(name);

    if (existingRole) {
      throw new ConflictException(
        'Role already exists',
      );
    }

    const role = new Role();

    role.name = name;
    role.description = description;

    return this.roles.save(role);
  }

  async findRoles(): Promise<Role[]> {
    return this.roles.findAll();
  }
}