import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { getDatabaseConfig } from './config/database.config';

import { OidcModule } from './oidc/oidc.module';
import { ApiModule } from './api/api.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SigningKeysModule } from './signing-keys/signing-keys.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [

    ScheduleModule.forRoot(),

    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRoot(
      getDatabaseConfig(),
    ),

    ApiModule,

    OidcModule,

    SigningKeysModule,
  ],
})
export class AppModule { }

console.log('hi'+join(process.cwd(), 'public'));