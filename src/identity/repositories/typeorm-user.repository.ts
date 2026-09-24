import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { UserRepository } from './user.repository';

@Injectable()
export class TypeOrmUserRepository implements UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {}

  async count(): Promise<number> {
    return this.repository.count();
  }

  async findAll(clientId?: string): Promise<User[]> {
    return this.repository.find({
      where: clientId
        ? {
            client: {
              clientId,
            },
          }
        : undefined,
      select: {
        id: true,
        username: true,
        email: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
        clientId: true,
      },
      relations: {
        roles: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(id: string, clientId: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        id,
        enabled: true,
        client: {
          clientId,
          enabled: true,
        },
      },
      relations: {
        roles: true,
      },
    });
  }

  async findByIdForAdministration(
    id: string,
    clientId: string,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: {
        id,
        client: {
          clientId,
          enabled: true,
        },
      },
      relations: {
        roles: true,
      },
    });
  }

  async findByIdForOidc(id: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        id,
        enabled: true,
        client: {
          enabled: true,
        },
      },
      relations: {
        roles: true,
      },
    });
  }

  async findByUsername(
    username: string,
    clientId: string,
  ): Promise<User | null> {
    return this.repository.findOne({
      where: {
        username,
        enabled: true,
        client: {
          clientId,
          enabled: true,
        },
      },
      relations: {
        roles: true,
      },
    });
  }

  async findByEmail(email: string, clientId: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        email,
        enabled: true,
        client: {
          clientId,
          enabled: true,
        },
      },
      relations: {
        roles: true,
      },
    });
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}
