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
  ) {
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async findAll(): Promise<User[]> {
    return this.repository.find({
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

  async findById(id: string, client_id: any): Promise<User | null> {
    return this.repository.findOne({
      where: { id, client: { clientId: client_id } }, relations: {
        roles: true,
      },
    });
  }

  async findByUsername(username: string, client_id: any): Promise<User | null> {
    return this.repository.findOne({
      where: { username, client: { clientId: client_id } }, relations: {
        roles: true,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
    });
  }

  async save(user: User): Promise<User> {
    return this.repository.save(user);
  }
}