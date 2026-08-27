import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Client } from '../entities/client.entity';
import { ClientRepository } from './client.repository';

@Injectable()
export class TypeOrmClientRepository
  implements ClientRepository
{
  constructor(
    @InjectRepository(Client)
    private readonly repository: Repository<Client>,
  ) {}

  async findByClientId(
    clientId: string,
  ): Promise<Client | null> {
    return this.repository.findOne({
      where: {
        clientId,
      },
    });
  }

  async save(
    client: Client,
  ): Promise<Client> {
    return this.repository.save(client);
  }
}