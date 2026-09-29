import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Oidc } from './entities/oidc.entity';
import { OidcCleanupService } from './oidc-cleanup.service';
import { OidcRepository } from './repositories/oidc.repository';
import { TypeOrmOidcRepository } from './repositories/typeorm-oidc.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Oidc])],

  providers: [
    {
      provide: OidcRepository,
      useClass: TypeOrmOidcRepository,
    },

    OidcCleanupService,
  ],

  exports: [OidcRepository],
})
export class OidcPersistenceModule {}
