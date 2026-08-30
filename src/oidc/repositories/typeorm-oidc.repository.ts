import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  DeepPartial,
  Repository,
} from 'typeorm';

import { Oidc } from '../entities/oidc.entity';
import { OidcRepository } from './oidc.repository';

@Injectable()
export class TypeOrmOidcRepository
  implements OidcRepository
{
  constructor(
    @InjectRepository(Oidc)
    private readonly repository: Repository<Oidc>,
  ) {}

  async find(
    model: string,
    id: string,
  ): Promise<Oidc | null> {
    return this.repository.findOne({
      where: {
        model,
        id,
      },
    });
  }

  async findByUid(
    model: string,
    uid: string,
  ): Promise<Oidc | null> {
    return this.repository.findOne({
      where: {
        model,
        uid,
      },
    });
  }

  async findByUserCode(
    model: string,
    userCode: string,
  ): Promise<Oidc | null> {
    return this.repository.findOne({
      where: {
        model,
        userCode,
      },
    });
  }

  async save(
    oidc: DeepPartial<Oidc>,
  ): Promise<Oidc> {
    return this.repository.save(oidc);
  }

  async delete(
    model: string,
    id: string,
  ): Promise<void> {
    await this.repository.delete({
      model,
      id,
    });
  }

  async findByGrantId(
    grantId: string,
  ): Promise<Oidc[]> {
    return this.repository.find({
      where: {
        grantId,
      },
    });
  }
}