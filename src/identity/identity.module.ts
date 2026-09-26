import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountController } from './account.controller';
import { ClientUserController } from './client-user.controller';
import { IdentityController } from './identity.controller';

import { ClientsModule } from 'src/clients/clients.module';
import { SecurityModule } from 'src/security/security.module';

import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';

import { IdentityService } from './identity.service';

import { RoleRepository } from './repositories/role.repository';
import { TypeOrmRoleRepository } from './repositories/typeorm-role.repository';

import { TypeOrmUserRepository } from './repositories/typeorm-user.repository';
import { UserRepository } from './repositories/user.repository';

import { ProvidersModule } from 'src/providers/providers.module';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';

@Module({
  imports: [
    forwardRef(() => ClientsModule),
    forwardRef(() => SecurityModule),

    TypeOrmModule.forFeature([User, Role, PasswordResetToken]),
    ProvidersModule,
  ],

  controllers: [IdentityController, ClientUserController, AccountController],

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

    PasswordResetTokenRepository,
  ],

  exports: [IdentityService, UserRepository, RoleRepository],
})
export class IdentityModule {}
