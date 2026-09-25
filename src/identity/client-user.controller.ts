import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ClientCredentialsGuard } from 'src/security/guards/client-credentials.guard';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import type { AuthenticatedRequest } from 'src/security/types/authenticated-request';

import { CreateClientUserDto } from './dto/create-client-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { IdentityService } from './identity.service';
import { UserMapper } from './user.mapper';

@ApiTags('Client Users')
@ApiBearerAuth('access-token')
@Controller('client/users')
@UseGuards(OidcAuthGuard, ClientCredentialsGuard)
export class ClientUserController {
  constructor(private readonly identityService: IdentityService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a user for the authenticated client',
    description:
      'Creates a new user and associates the user with the client represented by the client-credentials access token. The clientId is taken from the authenticated token and must not be supplied in the request body.',
  })
  @ApiBody({
    type: CreateClientUserDto,
    description:
      'User information. The clientId is determined from the access token.',
  })
  @ApiCreatedResponse({
    description: 'User created successfully.',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Authenticated client context is missing or request data is invalid.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({
    description:
      'The access token is valid but is not a client-credentials token.',
  })
  @ApiConflictResponse({
    description:
      'The client does not exist or is disabled, or the username/email already exists.',
  })
  async createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateClientUserDto,
  ): Promise<UserResponseDto> {
    const clientId = request.user.clientId;

    if (!clientId) {
      throw new BadRequestException('Authenticated client context is required');
    }

    const user = await this.identityService.createClientUser({
      ...dto,
      clientId,
    });

    return UserMapper.toResponse(user);
  }
}
