import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { CreateInitialAccessTokenDto } from '../../dto/create-initial-access-token.dto/create-initial-access-token.dto';
import { InitialAccessTokenService } from '../../services/initial-access-token/initial-access-token.service';

@Controller('admin/initial-access-tokens')
export class InitialAccessTokenController {
  constructor(
    private readonly initialAccessTokenService: InitialAccessTokenService,
  ) {}

  /**
   * Creates an Initial Access Token.
   *
   * The plaintext token is returned only once.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateInitialAccessTokenDto,
  ) {
    const result =
      await this.initialAccessTokenService.create(
        dto.name,
        {
          maxRegistrations: dto.maxRegistrations,
          expiresAt: dto.expiresAt
            ? new Date(dto.expiresAt)
            : undefined,
        },
      );

    return {
      id: result.initialAccessToken.id,
      name: result.initialAccessToken.name,

      /**
       * IMPORTANT:
       * This is the only time the plaintext token
       * should be returned.
       */
      token: result.token,

      maxRegistrations:
        result.initialAccessToken.maxRegistrations,

      expiresAt:
        result.initialAccessToken.expiresAt,

      createdAt:
        result.initialAccessToken.createdAt,
    };
  }
}