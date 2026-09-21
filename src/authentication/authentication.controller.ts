import { Body, Controller, Post, Res } from '@nestjs/common';

import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import express from 'express';

import { AuthenticationService } from './authentication.service';
import { LoginDto } from './dto/login.dto';

import { SessionsService } from '../sessions/sessions.service';

@Controller('auth')
@ApiTags('Authentication')
export class AuthenticationController {
  constructor(
    private readonly authenticationService: AuthenticationService,

    private readonly sessionsService: SessionsService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate a user and create an IDP session' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, description: 'Session cookie created.' })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or portal access denied.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true })
    response: express.Response,
  ): Promise<void> {
    const user = await this.authenticationService.authenticate(
      dto.username,
      dto.password,
      dto.client_id,
    );

    const session = await this.sessionsService.createSession(user.id);

    response.cookie('idp_session', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
      path: '/',
    });
  }
}
