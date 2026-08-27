import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from './entities/client.entity';

import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

import { ClientRepository } from './repositories/client.repository';
import { TypeOrmClientRepository } from './repositories/typeorm-client.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
  ],

  controllers: [
    ClientsController,
  ],

  providers: [
    ClientsService,

    {
      provide: ClientRepository,
      useClass: TypeOrmClientRepository,
    },
  ],

  exports: [
    ClientsService,
    ClientRepository,
  ],
})
export class ClientsModule {}