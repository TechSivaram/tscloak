import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Client } from './entities/client.entity';

import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

import { ClientRepository } from './repositories/client.repository';
import { TypeOrmClientRepository } from './repositories/typeorm-client.repository';
import { SecurityModule } from 'src/security/security.module';
import { IdentityModule } from 'src/identity/identity.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    forwardRef(() => SecurityModule),
    forwardRef(() => IdentityModule),
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