import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdentityService } from './identity.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UserMapper } from './user.mapper';
import { UserResponseDto } from './dto/user-response.dto';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { Roles } from 'src/security/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/security/types/authenticated-request';

@UseGuards(
  OidcAuthGuard,
  RolesGuard,
)
@ApiTags('Users')
@Controller('users')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
  ) { }

  @Post()
  @Roles('IDP_ADMIN', 'CLIENT_ADMIN')
  @ApiOperation({
    summary: 'Create a user',
    description:
      'Creates a new user and associates the user with a client.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully.',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  @ApiResponse({
    status: 409,
    description: 'Username or email already exists.',
  })
  async createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateUserDto,
  ): Promise<UserResponseDto> {

    dto.clientId = request.user.clientId ?? "";
    const user =
      await this.identityService.createUser(dto);

    return UserMapper.toResponse(user);
  }

  @Get()
  @Roles('IDP_ADMIN')
  async findUsers(): Promise<UserResponseDto[]> {
    const users = await this.identityService.findUsers();
    return users.map(UserMapper.toResponse);
  }

  @Put(':id')
  @Roles('IDP_ADMIN')
  async updateUser(
    @Param('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.identityService.updateUser(
      userId,
      request.user.clientId ?? '',
      dto,
    );

    return UserMapper.toResponse(user);
  }

  @Get('roles')
  @Roles('IDP_ADMIN')
  async findRoles() {
    return this.identityService.findRoles();
  }

  @Post('roles')
  @Roles('IDP_ADMIN')
  async createRole(
    @Body() body: { name: string; description?: string },
  ) {
    return this.identityService.createRole(
      body.name,
      body.description,
    );
  }

  @Put('roles/:id')
  @Roles('IDP_ADMIN')
  async updateRole(
    @Param('id') roleId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.identityService.updateRole(
      roleId,
      dto.description,
    );
  }

  @Put(':id/roles')
  @Roles('IDP_ADMIN')
  async assignRoles(
    @Param('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: AssignUserRolesDto,
  ): Promise<UserResponseDto> {
    const user = await this.identityService.assignRoles(
      userId,
      request.user.clientId ?? '',
      dto.roles,
    );

    return UserMapper.toResponse(user);
  }
}