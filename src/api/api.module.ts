import { Module } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module';
// import { AuthenticationModule } from '../authentication/authentication.module';
import { AdminModule } from 'src/admin/admin.module';
import { FederationModule } from 'src/federation/federation.module';
import { RegistrationModule } from 'src/registration/registration.module';
import { SecurityModule } from 'src/security/security.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    IdentityModule,
    //AuthenticationModule,
    ClientsModule,
    SecurityModule,
    RegistrationModule,
    AdminModule,
    FederationModule,
    RouterModule.register([
      {
        path: 'api', // Common prefix applied to ALL children below
        children: [
          IdentityModule, // Resolves to: /api + /users = /api/users
          // AuthenticationModule, // Resolves to: /api + /auth  = /api/auth/login
          ClientsModule, // Resolves to: /api + /clients
          SecurityModule, // Resolves to: /api + /security
          RegistrationModule, // Resolves to: /api + /registration
          AdminModule, // Resolves to: /api + /admin
          FederationModule, // Resolves to: /api + /federation
        ],
      },
    ]),
  ],
})
export class ApiModule {}
