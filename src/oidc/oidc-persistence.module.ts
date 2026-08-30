import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Oidc } from './entities/oidc.entity';
import { OidcRepository } from './repositories/oidc.repository';
import { TypeOrmOidcRepository } from './repositories/typeorm-oidc.repository';
import { OidcCleanupService } from './oidc-cleanup.service';

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

    OidcCleanupService,
  ],

  exports: [
    OidcRepository,
  ],
})
export class OidcPersistenceModule { }