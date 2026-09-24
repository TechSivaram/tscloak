import { Module } from '@nestjs/common';

//import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';

import { ClientsModule } from 'src/clients/clients.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [IdentityModule, ClientsModule],

  providers: [AuthenticationService],

  exports: [AuthenticationService],
})
export class AuthenticationModule {}
