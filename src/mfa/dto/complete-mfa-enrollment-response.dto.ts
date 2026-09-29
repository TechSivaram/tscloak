import { ApiProperty } from '@nestjs/swagger';

export class CompleteMfaEnrollmentResponseDto {
  @ApiProperty({
    description: 'Indicates that MFA enrollment completed successfully.',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'MFA method that was enrolled.',
    example: 'totp',
  })
  method: string;

  @ApiProperty({
    description:
      'One-time recovery codes. These are shown only immediately after enrollment and cannot be retrieved later.',
    example: ['A1B2-C3D4-E5F6-7890', '1122-3344-5566-7788'],
    type: [String],
  })
  recoveryCodes: string[];
}
