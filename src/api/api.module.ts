import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { SessionsModule } from '../sessions/sessions.module';
import { ClientsModule } from '../clients/clients.module';
import { SecurityModule } from 'src/security/security.module';
import { RegistrationModule } from 'src/registration/registration.module';
import { AdminModule } from 'src/admin/admin.module';

@Module({
  imports: [
    IdentityModule,
    AuthenticationModule,
    SessionsModule,
    ClientsModule,
    SecurityModule,
    RegistrationModule,
    AdminModule,
    RouterModule.register([
      {
        path: 'api', // Common prefix applied to ALL children below
        children: [
          IdentityModule,       // Resolves to: /api + /users = /api/users
          AuthenticationModule, // Resolves to: /api + /auth  = /api/auth/login
          SessionsModule,       // Resolves to: /api + /sessions
          ClientsModule,        // Resolves to: /api + /clients
          SecurityModule,       // Resolves to: /api + /security
          RegistrationModule,   // Resolves to: /api + /registration
          AdminModule,          // Resolves to: /api + /admin
        ],
      },
    ]),
  ],
})
export class ApiModule { }