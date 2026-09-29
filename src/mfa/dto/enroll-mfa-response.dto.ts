import { ApiProperty } from '@nestjs/swagger';

export class EnrollMfaResponseDto {
  @ApiProperty({
    description: 'Indicates whether MFA enrollment has started.',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'MFA method being enrolled.',
    example: 'totp',
  })
  method: string;

  @ApiProperty({
    description:
      'Secret key used to configure the authenticator application manually.',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'otpauth URI used to configure the authenticator application.',
    example:
      'otpauth://totp/TSCloak:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=TSCloak',
  })
  otpauthUri: string;

  @ApiProperty({
    description: 'QR code containing the otpauth URI, encoded as a data URL.',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  qrCode: string;
}
