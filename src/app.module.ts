import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getDatabaseConfig } from './config/database.config';

import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AdminModule } from './admin/admin.module';
import { ApiModule } from './api/api.module';
import { OidcModule } from './oidc/oidc.module';
import { SigningKeysModule } from './signing-keys/signing-keys.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),

    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot(getDatabaseConfig()),

    ApiModule,

    OidcModule,

    SigningKeysModule,

    AdminModule,
  ],
})
export class AppModule {}

console.log('hi' + join(process.cwd(), 'public'));
