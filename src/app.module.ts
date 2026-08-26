import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getDatabaseConfig } from './config/database.config';
import { IdentityModule } from './identity/identity.module';
import { AuthenticationModule } from './authentication/authentication.module';
import { SessionsModule } from './sessions/sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot(getDatabaseConfig()),

    IdentityModule,

    AuthenticationModule,

    SessionsModule,
  ],
})
export class AppModule {}