import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import { ClientsService } from '../clients/clients.service';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  clientId: string;
}

export interface UpdateUserInput {
  email?: string;
  enabled?: boolean;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly clients: ClientsService,
  ) {}

  async countUsers(): Promise<number> {
    return this.users.count();
  }

  async findUsers(clientId?: string): Promise<User[]> {
    return this.users.findAll(clientId);
  }

  async countRoles(): Promise<number> {
    return this.roles.count();
  }

  async createUser(input: CreateUserInput): Promise<User> {
    return this.createUserWithRoles(input);
  }

  async createClientUser(input: CreateUserInput): Promise<User> {
    return this.createUserWithRoles(input);
  }

  private async createUserWithRoles(
    input: CreateUserInput,
    roleNames: string[] = ['USER'],
  ): Promise<User> {
    if (!input.clientId) {
      throw new BadRequestException('Client ID is required');
    }

    const clnt = await this.clients.findByClientId(input.clientId);
    if (clnt === null) {
      throw new ConflictException('Client does not exist');
    }

    input.clientId = clnt.id;
    const existingUsername = await this.users.findByUsername(
      input.username,
      input.clientId,
    );

    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    const existingEmail = await this.users.findByEmail(
      input.email,
      input.clientId,
    );

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(input.password);

    const user = new User();

    user.username = input.username;
    user.email = input.email;
    user.passwordHash = passwordHash;
    user.enabled = true;
    user.clientId = input.clientId;

    if (roleNames.length > 0) {
      const assignedRoles = await Promise.all(
        roleNames.map((roleName) => this.roles.findByName(roleName)),
      );

      if (assignedRoles.some((role) => !role)) {
        throw new ConflictException('Required user role is not configured');
      }

      user.roles = assignedRoles.filter((role): role is Role => role !== null);
    }

    return this.users.save(user);
  }

  async findByUsername(username: string, client_id: any): Promise<User | null> {
    return this.users.findByUsername(username, client_id);
  }

  async findById(id: string, client_id: any): Promise<User | null> {
    return this.users.findById(id, client_id);
  }

  async findByIdForOidc(id: string): Promise<User | null> {
    return this.users.findByIdForOidc(id);
  }

  async updateUser(
    userId: string,
    clientId: string,
    input: UpdateUserInput,
  ): Promise<User> {
    const user = await this.users.findById(userId, clientId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (input.email !== undefined) user.email = input.email;
    if (input.enabled !== undefined) user.enabled = input.enabled;

    return this.users.save(user);
  }

  async createRole(name: string, description?: string): Promise<Role> {
    const existingRole = await this.roles.findByName(name);

    if (existingRole) {
      throw new ConflictException('Role already exists');
    }

    const role = new Role();

    role.name = name;
    role.description = description;

    return this.roles.save(role);
  }

  async findRoles(): Promise<Role[]> {
    return this.roles.findAll();
  }

  async updateRole(roleId: string, description?: string): Promise<Role> {
    const role = await this.roles.findById(roleId);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    role.description = description;
    return this.roles.save(role);
  }

  async assignRoles(
    userId: string,
    clientId: string,
    roleNames: string[],
  ): Promise<User> {
    const user = await this.users.findById(userId, clientId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = await Promise.all(
      roleNames.map((roleName) => this.roles.findByName(roleName)),
    );

    const missingRole = roles.find((role) => !role);
    if (missingRole) {
      throw new NotFoundException('One or more roles were not found');
    }

    user.roles = roles.filter((role): role is Role => role !== null);

    return this.users.save(user);
  }
}
