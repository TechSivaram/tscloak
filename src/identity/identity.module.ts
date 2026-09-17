import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';
import { IdentityService } from './identity.service';
import { IdentityController } from './identity.controller';
import { Role } from './entities/role.entity';
import { RoleRepository } from './repositories/role.repository';
import { TypeOrmRoleRepository } from './repositories/typeorm-role.repository';
import { SecurityModule } from 'src/security/security.module';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [
    forwardRef(() => ClientsModule),
    forwardRef(() => SecurityModule),
    TypeOrmModule.forFeature([User, Role]),
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

    {
      provide: RoleRepository,
      useClass: TypeOrmRoleRepository,
    },
  ],

  exports: [
    IdentityService,
    UserRepository,
    RoleRepository
  ],
})
export class IdentityModule { }