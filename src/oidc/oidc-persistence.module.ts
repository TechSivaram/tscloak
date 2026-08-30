import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Oidc } from './entities/oidc.entity';
import { OidcRepository } from './repositories/oidc.repository';
import { TypeOrmOidcRepository } from './repositories/typeorm-oidc.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Oidc,
    ]),
  ],

  providers: [
    {
      provide: OidcRepository,
      useClass: TypeOrmOidcRepository,
    },
  ],

  exports: [
    OidcRepository,
  ],
})
export class OidcPersistenceModule {}