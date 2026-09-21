import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiBearerAuth,
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

@UseGuards(OidcAuthGuard, RolesGuard)
@ApiTags('Users')
@Controller('users')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  @Roles('IDP_ADMIN', 'IDP_CLIENT_ADMIN')
  @ApiOperation({
    summary: 'Create a user',
    description: 'Creates a new user and associates the user with a client.',
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
    dto.clientId = await this.resolveTargetClientId(request, dto.clientId);
    const user = request.user.roles.includes('IDP_CLIENT_ADMIN')
      ? await this.identityService.createClientUser(dto)
      : await this.identityService.createUser(dto);

    return UserMapper.toResponse(user);
  }

  @Get()
  @Roles('IDP_ADMIN', 'IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'List users for the permitted client scope' })
  @ApiResponse({
    status: 200,
    description: 'Users returned.',
    type: [UserResponseDto],
  })
  async findUsers(
    @Req() request: AuthenticatedRequest,
    @Query('client_id') clientId?: string,
  ): Promise<UserResponseDto[]> {
    const targetClientId = await this.resolveTargetClientId(request, clientId);
    const users = await this.identityService.findUsers(targetClientId);
    return users.map(UserMapper.toResponse);
  }

  @Put(':id')
  @Roles('IDP_ADMIN', 'IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({
    status: 200,
    description: 'User updated.',
    type: UserResponseDto,
  })
  async updateUser(
    @Param('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Query('client_id') clientId: string | undefined,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.identityService.updateUser(
      userId,
      await this.resolveTargetClientId(request, clientId),
      dto,
    );

    return UserMapper.toResponse(user);
  }

  @Get('roles')
  @Roles('IDP_ADMIN', 'IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'List available roles' })
  @ApiResponse({ status: 200, description: 'Roles returned.' })
  async findRoles() {
    return this.identityService.findRoles();
  }

  @Post('roles')
  @Roles('IDP_ADMIN')
  @ApiOperation({ summary: 'Create a role' })
  @ApiResponse({ status: 201, description: 'Role created.' })
  async createRole(@Body() body: { name: string; description?: string }) {
    return this.identityService.createRole(body.name, body.description);
  }

  @Put('roles/:id')
  @Roles('IDP_ADMIN')
  @ApiOperation({ summary: 'Update a role description' })
  @ApiResponse({ status: 200, description: 'Role updated.' })
  async updateRole(@Param('id') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.identityService.updateRole(roleId, dto.description);
  }

  @Put(':id/roles')
  @Roles('IDP_ADMIN', 'IDP_CLIENT_ADMIN')
  @ApiOperation({ summary: 'Assign roles to a user' })
  @ApiResponse({
    status: 200,
    description: 'User roles updated.',
    type: UserResponseDto,
  })
  async assignRoles(
    @Param('id') userId: string,
    @Req() request: AuthenticatedRequest,
    @Query('client_id') clientId: string | undefined,
    @Body() dto: AssignUserRolesDto,
  ): Promise<UserResponseDto> {
    const requestedRoles = request.user.roles.includes('IDP_CLIENT_ADMIN')
      ? ['USER']
      : dto.roles;

    const user = await this.identityService.assignRoles(
      userId,
      await this.resolveTargetClientId(request, clientId),
      requestedRoles,
    );

    return UserMapper.toResponse(user);
  }

  private async resolveTargetClientId(
    request: AuthenticatedRequest,
    requestedClientId?: string,
  ): Promise<string> {
    const authenticatedClientId = request.user.clientId ?? '';
    const authenticatedUser = await this.identityService.findById(
      request.user.id,
      authenticatedClientId,
    );
    const isIdpAdmin = authenticatedUser?.roles?.some(
      (role) => role.name === 'IDP_ADMIN',
    );

    if (isIdpAdmin && requestedClientId) {
      return requestedClientId;
    }

    if (!authenticatedClientId) {
      throw new BadRequestException('Client ID is required');
    }

    return authenticatedClientId;
  }
}
