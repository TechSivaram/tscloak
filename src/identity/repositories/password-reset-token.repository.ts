import { Injectable } from '@nestjs/common';
import { DataSource, IsNull, Repository } from 'typeorm';

import { PasswordResetToken } from '../entities/password-reset-token.entity';

@Injectable()
export class PasswordResetTokenRepository extends Repository<PasswordResetToken> {
  constructor(dataSource: DataSource) {
    super(PasswordResetToken, dataSource.createEntityManager());
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    return this.createQueryBuilder('resetToken')
      .innerJoinAndSelect(
        'resetToken.client',
        'client',
        'client.enabled = :clientEnabled',
        { clientEnabled: true },
      )
      .innerJoin('resetToken.user', 'user', 'user.enabled = :userEnabled', {
        userEnabled: true,
      })
      .select([
        'resetToken.id',
        'resetToken.tokenHash',
        'resetToken.userId',
        'resetToken.clientId',
        'resetToken.expiresAt',
        'resetToken.usedAt',
        'resetToken.createdAt',
        'client.clientId',
      ])
      .where('resetToken.tokenHash = :tokenHash', {
        tokenHash,
      })
      .getOne();
  }

  async findActiveByUserId(
    userId: string,
    clientId: string,
  ): Promise<PasswordResetToken | null> {
    return this.findOne({
      where: {
        userId,
        clientId,
        usedAt: IsNull(),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async invalidateForUser(userId: string, clientId: string): Promise<void> {
    await this.createQueryBuilder()
      .update(PasswordResetToken)
      .set({
        usedAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('clientId = :clientId', { clientId })
      .andWhere('usedAt IS NULL')
      .execute();
  }
}
