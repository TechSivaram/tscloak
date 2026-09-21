import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Role } from '../entities/role.entity';
import { RoleRepository } from './role.repository';

@Injectable()
export class TypeOrmRoleRepository implements RoleRepository {
  constructor(
    @InjectRepository(Role)
    private readonly repository: Repository<Role>,
  ) {}

  async count(): Promise<number> {
    return this.repository.count();
  }

  async findByName(name: string): Promise<Role | null> {
    return this.repository.findOne({
      where: { name },
    });
  }

  async findById(id: string): Promise<Role | null> {
    return this.repository.findOne({
      where: { id },
    });
  }

  async save(role: Role): Promise<Role> {
    return this.repository.save(role);
  }

  async findAll(): Promise<Role[]> {
    return this.repository.find();
  }
}
