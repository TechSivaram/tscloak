import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RouterModule } from '@nestjs/core';

import { getDatabaseConfig } from './config/database.config';

import { OidcModule } from './oidc/oidc.module';
import { ApiModule } from './api/api.module';
import { ScheduleModule } from '@nestjs/schedule';

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
  ],
})
export class AppModule {}