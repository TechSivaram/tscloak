import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Session } from '../entities/session.entity';
import { SessionRepository } from './session.repository';

@Injectable()
export class TypeOrmSessionRepository
  implements SessionRepository
{
  constructor(
    @InjectRepository(Session)
    private readonly repository: Repository<Session>,
  ) {}

  async create(
    session: Session,
  ): Promise<Session> {
    return this.repository.save(session);
  }

  async findById(
    id: string,
  ): Promise<Session | null> {
    return this.repository.findOne({
      where: { id },
    });
  }

  async save(
    session: Session,
  ): Promise<Session> {
    return this.repository.save(session);
  }
}