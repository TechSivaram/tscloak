import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [
    IdentityController,
  ],
  providers: [
    IdentityService,
    {
      provide: UserRepository,
      useClass: TypeOrmUserRepository,
    },
  ],

  exports: [
    IdentityService,
    UserRepository,
  ],
})
export class IdentityModule { }