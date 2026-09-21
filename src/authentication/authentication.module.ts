import { Module } from '@nestjs/common';

import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';

import { IdentityModule } from '../identity/identity.module';
import { SessionsModule } from 'src/sessions/sessions.module';
import { ClientsModule } from 'src/clients/clients.module';

@Module({
  imports: [IdentityModule, SessionsModule, ClientsModule],

  controllers: [AuthenticationController],

  providers: [AuthenticationService],

  exports: [AuthenticationService],
})
export class AuthenticationModule {}
