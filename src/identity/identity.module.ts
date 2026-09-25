import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ClientsModule } from 'src/clients/clients.module';
import { SecurityModule } from 'src/security/security.module';
import { ClientUserController } from './client-user.controller';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { RoleRepository } from './repositories/role.repository';
import { TypeOrmRoleRepository } from './repositories/typeorm-role.repository';
import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  imports: [
    forwardRef(() => ClientsModule),
    forwardRef(() => SecurityModule),
    TypeOrmModule.forFeature([User, Role]),
  ],
  controllers: [IdentityController, ClientUserController],
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

  exports: [IdentityService, UserRepository, RoleRepository],
})
export class IdentityModule {}
