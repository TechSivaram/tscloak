import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InitialAccessTokenController } from './controllers/initial-access-token/initial-access-token.controller';
import { InitialAccessToken } from './entities/initial-access-token.entity';
import { InitialAccessTokenService } from './services/initial-access-token/initial-access-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InitialAccessToken,
    ]),
  ],
  controllers: [
    InitialAccessTokenController,
  ],
  providers: [
    InitialAccessTokenService,
  ],
  exports: [
    InitialAccessTokenService,
  ],
})
export class RegistrationModule {}