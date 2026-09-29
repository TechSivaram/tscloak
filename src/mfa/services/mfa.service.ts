import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import * as QRCode from 'qrcode';
import { CompleteMfaEnrollmentResponseDto } from '../dto/complete-mfa-enrollment-response.dto';
import { DisableMfaResponseDto } from '../dto/disable-mfa-response.dto';
import { EnrollMfaResponseDto } from '../dto/enroll-mfa-response.dto';
import { MfaStatusResponseDto } from '../dto/mfa-status-response.dto';
import { RegenerateRecoveryCodesResponseDto } from '../dto/regenerate-recovery-codes-response.dto';
import { UserMfaRecoveryCode } from '../entities/user-mfa-recovery-code.entity';
import { MfaMethod, UserMfa } from '../entities/user-mfa.entity';
import { MfaAttemptRateLimitService } from './mfa-attempt-rate-limit.service';
import { MfaCryptoService } from './mfa-crypto.service';
import { MfaRecoveryCodeService } from './mfa-recovery-code.service';
import { MfaTotpService } from './mfa-totp.service';

@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(UserMfa)
    private readonly userMfaRepository: Repository<UserMfa>,

    @InjectRepository(UserMfaRecoveryCode)
    private readonly recoveryCodeRepository: Repository<UserMfaRecoveryCode>,

    private readonly dataSource: DataSource,
    private readonly mfaCryptoService: MfaCryptoService,
    private readonly mfaTotpService: MfaTotpService,
    private readonly mfaRecoveryCodeService: MfaRecoveryCodeService,
    private readonly mfaAttemptRateLimitService: MfaAttemptRateLimitService,
  ) {}

  async startEnrollment(
    userId: string,
    accountName: string,
  ): Promise<EnrollMfaResponseDto> {
    let userMfa = await this.userMfaRepository.findOne({
      where: { userId },
    });

    if (userMfa?.enabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = this.mfaTotpService.generateSecret();

    const encryptedSecret = this.mfaCryptoService.encrypt(secret);

    const otpauthUri = this.mfaTotpService.generateOtpAuthUri(
      accountName,
      secret,
    );

    const qrCode = await QRCode.toDataURL(otpauthUri);

    if (!userMfa) {
      userMfa = this.userMfaRepository.create({
        userId,
        enabled: false,
        method: MfaMethod.TOTP,
        encryptedSecret,
        enrolledAt: null,
      });
    } else {
      userMfa.enabled = false;
      userMfa.method = MfaMethod.TOTP;
      userMfa.encryptedSecret = encryptedSecret;
      userMfa.enrolledAt = null;
    }

    await this.userMfaRepository.save(userMfa);

    return {
      enabled: false,
      method: MfaMethod.TOTP,
      secret,
      otpauthUri,
      qrCode,
    };
  }

  async completeEnrollment(
    userId: string,
    code: string,
  ): Promise<CompleteMfaEnrollmentResponseDto> {
    const userMfa = await this.userMfaRepository.findOne({
      where: { userId },
    });

    if (!userMfa || !userMfa.encryptedSecret) {
      throw new BadRequestException('MFA enrollment has not been started');
    }

    if (userMfa.enabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = this.mfaCryptoService.decrypt(userMfa.encryptedSecret);

    const valid = await this.mfaTotpService.verifyCode(secret, code);

    if (!valid) {
      throw new BadRequestException('Invalid MFA verification code');
    }

    const recoveryCodes = await this.mfaRecoveryCodeService.generateCodes();

    const recoveryCodeHashes =
      await this.mfaRecoveryCodeService.hashCodes(recoveryCodes);

    await this.dataSource.transaction(async (manager) => {
      userMfa.enabled = true;
      userMfa.enrolledAt = new Date();

      await manager.save(UserMfa, userMfa);

      await manager.delete(UserMfaRecoveryCode, {
        userMfaId: userMfa.id,
      });

      const entities = recoveryCodeHashes.map((codeHash) =>
        manager.create(UserMfaRecoveryCode, {
          userMfaId: userMfa.id,
          codeHash,
          usedAt: null,
        }),
      );

      await manager.save(UserMfaRecoveryCode, entities);
    });

    return {
      enabled: true,
      method: userMfa.method,
      recoveryCodes,
    };
  }

  async getUserMfa(userId: string): Promise<UserMfa | null> {
    return this.userMfaRepository.findOne({
      where: { userId },
    });
  }

  async verifyTotp(userId: string, code: string): Promise<boolean> {
    const userMfa = await this.userMfaRepository.findOne({
      where: {
        userId,
        enabled: true,
      },
    });

    if (!userMfa?.encryptedSecret) {
      return false;
    }

    const secret = this.mfaCryptoService.decrypt(userMfa.encryptedSecret);

    return this.mfaTotpService.verifyCode(secret, code);
  }

  async verifyRecoveryCode(userId: string, code: string): Promise<boolean> {
    const userMfa = await this.userMfaRepository.findOne({
      where: {
        userId,
        enabled: true,
      },
    });

    if (!userMfa) {
      return false;
    }

    return this.mfaRecoveryCodeService.consumeCode(userMfa.id, code);
  }

  async getStatus(userId: string): Promise<MfaStatusResponseDto> {
    const userMfa = await this.userMfaRepository.findOne({
      where: { userId },
    });

    return {
      enabled: userMfa?.enabled ?? false,
      method: userMfa?.method ?? null,
      enrolledAt: userMfa?.enrolledAt ?? null,
    };
  }

  async disableMfa(
    userId: string,
    code: string,
  ): Promise<DisableMfaResponseDto> {
    const userMfa = await this.userMfaRepository.findOne({
      where: {
        userId,
        enabled: true,
        method: MfaMethod.TOTP,
      },
    });

    if (!userMfa?.encryptedSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.mfaCryptoService.decrypt(userMfa.encryptedSecret);

    const valid = await this.mfaTotpService.verifyCode(secret, code);

    if (!valid) {
      throw new BadRequestException('Invalid MFA verification code');
    }

    await this.dataSource.transaction(async (manager) => {
      userMfa.enabled = false;
      userMfa.encryptedSecret = null;
      userMfa.enrolledAt = null;

      await manager.save(UserMfa, userMfa);

      await manager.delete(UserMfaRecoveryCode, {
        userMfaId: userMfa.id,
      });
    });

    return {
      enabled: false,
      method: userMfa.method,
      disabledAt: new Date(),
    };
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
  ): Promise<RegenerateRecoveryCodesResponseDto> {
    const userMfa = await this.userMfaRepository.findOne({
      where: {
        userId,
        enabled: true,
        method: MfaMethod.TOTP,
      },
    });

    if (!userMfa?.encryptedSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const secret = this.mfaCryptoService.decrypt(userMfa.encryptedSecret);

    const valid = await this.mfaTotpService.verifyCode(secret, code);

    if (!valid) {
      throw new BadRequestException('Invalid MFA verification code');
    }

    const recoveryCodes = await this.mfaRecoveryCodeService.generateCodes();

    const recoveryCodeHashes =
      await this.mfaRecoveryCodeService.hashCodes(recoveryCodes);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(UserMfaRecoveryCode, {
        userMfaId: userMfa.id,
      });

      const entities = recoveryCodeHashes.map((codeHash) =>
        manager.create(UserMfaRecoveryCode, {
          userMfaId: userMfa.id,
          codeHash,
          usedAt: null,
        }),
      );

      await manager.save(UserMfaRecoveryCode, entities);
    });

    return {
      recoveryCodes,
    };
  }
}
