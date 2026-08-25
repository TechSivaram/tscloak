import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function getDatabaseConfig(): TypeOrmModuleOptions {
  return {
    type: 'better-sqlite3',
    database: process.env.DATABASE_PATH ?? './data/idp.sqlite',

    autoLoadEntities: true,

    synchronize: true,
  };
}