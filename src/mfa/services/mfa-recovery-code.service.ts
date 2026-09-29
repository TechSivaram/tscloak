import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { UserMfaRecoveryCode } from '../entities/user-mfa-recovery-code.entity';

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 8;

@Injectable()
export class MfaRecoveryCodeService {
  constructor(
    @InjectRepository(UserMfaRecoveryCode)
    private readonly repository: Repository<UserMfaRecoveryCode>,
  ) {}

  async generateCodes(): Promise<string[]> {
    const codes: string[] = [];

    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      codes.push(this.generateCode());
    }

    return codes;
  }

  async hashCodes(codes: string[]): Promise<string[]> {
    return Promise.all(codes.map((code) => argon2.hash(this.normalize(code))));
  }

  async verifyCode(code: string, hashes: string[]): Promise<number | null> {
    const normalizedCode = this.normalize(code);

    for (let index = 0; index < hashes.length; index++) {
      const valid = await argon2.verify(hashes[index], normalizedCode);

      if (valid) {
        return index;
      }
    }

    return null;
  }

  private generateCode(): string {
    const value = randomBytes(RECOVERY_CODE_BYTES)
      .toString('hex')
      .toUpperCase();

    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(
      8,
      12,
    )}-${value.slice(12, 16)}`;
  }

  private normalize(code: string): string {
    return code.replace(/-/g, '').trim().toUpperCase();
  }

  async consumeCode(userMfaId: number, code: string): Promise<boolean> {
    const normalizedCode = this.normalize(code);

    const recoveryCodes = await this.repository.find({
      where: {
        userMfaId,
        usedAt: IsNull(),
      },
    });

    for (const recoveryCode of recoveryCodes) {
      const valid = await argon2.verify(recoveryCode.codeHash, normalizedCode);

      if (!valid) {
        continue;
      }

      const result = await this.repository
        .createQueryBuilder()
        .update(UserMfaRecoveryCode)
        .set({
          usedAt: new Date(),
        })
        .where('id = :id', { id: recoveryCode.id })
        .andWhere('usedAt IS NULL')
        .execute();

      return (result.affected ?? 0) === 1;
    }

    return false;
  }
}
