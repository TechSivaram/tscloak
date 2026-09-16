import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { IdentityService } from './identity.service';
import { CreateUserDto } from './dto/create-user.dto';
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
}