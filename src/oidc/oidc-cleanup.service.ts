import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { OidcRepository } from './repositories/oidc.repository';

@Injectable()
export class OidcCleanupService
  implements OnModuleInit {
  private readonly logger =
    new Logger(OidcCleanupService.name);

  constructor(
    private readonly oidcRepository: OidcRepository,
  ) {}

  onModuleInit(): void {
    this.logger.log(
      'OIDC cleanup service initialized',
    );
  }

  @Cron('0 */5 * * * *')
  async cleanupExpiredRecords(): Promise<void> {
    this.logger.log(
      'OIDC cleanup job running',
    );

    const deleted =
      await this.oidcRepository.deleteExpired(
        new Date(),
      );

    this.logger.log(
      `Deleted ${deleted} expired OIDC records`,
    );
  }
}