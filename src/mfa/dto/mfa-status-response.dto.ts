import { ApiProperty } from '@nestjs/swagger';
import { MfaMethod } from '../entities/user-mfa.entity';

export class MfaStatusResponseDto {
  @ApiProperty({
    example: false,
    description: 'Whether MFA is currently enabled for the authenticated user.',
  })
  enabled: boolean;

  @ApiProperty({
    enum: MfaMethod,
    nullable: true,
    example: MfaMethod.TOTP,
    description: 'Configured MFA method, or null when MFA is not configured.',
  })
  method: MfaMethod | null;

  @ApiProperty({
    nullable: true,
    example: '2026-09-28T12:30:00.000Z',
    description: 'Timestamp when MFA enrollment was completed.',
  })
  enrolledAt: Date | null;
}
