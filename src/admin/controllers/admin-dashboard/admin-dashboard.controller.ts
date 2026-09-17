import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminDashboardService } from '../../services/admin-dashboard/admin-dashboard.service';

import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { Roles } from 'src/security/decorators/roles.decorator';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(
  OidcAuthGuard,
  RolesGuard,
)
export class AdminDashboardController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @Get()
  @Roles('IDP_ADMIN')
  @ApiOperation({
    summary: 'Get admin dashboard statistics',
  })
  async getDashboard() {
    return this.adminDashboardService.getDashboard();
  }
}