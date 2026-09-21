import { Module } from '@nestjs/common';
import { ClientsModule } from 'src/clients/clients.module';
import { IdentityModule } from 'src/identity/identity.module';
import { RegistrationModule } from 'src/registration/registration.module';
import { SecurityModule } from 'src/security/security.module';

import { AdminDashboardController } from './controllers/admin-dashboard/admin-dashboard.controller';
import { AdminClientConfigController } from './controllers/admin-client-config/admin-client-config.controller';
import { AdminDashboardService } from './services/admin-dashboard/admin-dashboard.service';

@Module({
  imports: [ClientsModule, IdentityModule, RegistrationModule, SecurityModule],

  controllers: [AdminDashboardController, AdminClientConfigController],

  providers: [AdminDashboardService],
})
export class AdminModule {}
