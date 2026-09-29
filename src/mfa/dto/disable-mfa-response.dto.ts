import { ApiProperty } from '@nestjs/swagger';
import { MfaMethod } from '../entities/user-mfa.entity';

export class DisableMfaResponseDto {
  @ApiProperty({
    example: false,
    description: 'Whether MFA is currently enabled after the operation.',
  })
  enabled: false;

  @ApiProperty({
    enum: MfaMethod,
    example: MfaMethod.TOTP,
    description: 'The MFA method that was disabled.',
  })
  method: MfaMethod;

  @ApiProperty({
    example: '2026-09-29T12:00:00.000Z',
    description: 'Time at which MFA was disabled.',
  })
  disabledAt: Date;
}
