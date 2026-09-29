import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from 'src/security/security.module';
import { MfaController } from './controllers/mfa.controller';
import { UserMfaRecoveryCode } from './entities/user-mfa-recovery-code.entity';
import { UserMfa } from './entities/user-mfa.entity';
import { MfaAttemptRateLimitService } from './services/mfa-attempt-rate-limit.service';
import { MfaCryptoService } from './services/mfa-crypto.service';
import { MfaRecoveryCodeService } from './services/mfa-recovery-code.service';
import { MfaTotpService } from './services/mfa-totp.service';
import { MfaService } from './services/mfa.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserMfa, UserMfaRecoveryCode]),
    SecurityModule,
  ],

  providers: [
    MfaService,
    MfaCryptoService,
    MfaTotpService,
    MfaRecoveryCodeService,
    MfaAttemptRateLimitService,
  ],
  exports: [
    MfaService,
    MfaCryptoService,
    MfaTotpService,
    MfaRecoveryCodeService,
    MfaAttemptRateLimitService,
  ],
  controllers: [MfaController],
})
export class MfaModule {}
