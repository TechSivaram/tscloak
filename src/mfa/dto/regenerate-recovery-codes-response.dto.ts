import { ApiProperty } from '@nestjs/swagger';

export class RegenerateRecoveryCodesResponseDto {
  @ApiProperty({
    type: [String],
    example: ['A1B2-C3D4-E5F6-7890', '1234-ABCD-5678-EFGH'],
    description:
      'New recovery codes. Each code is returned only once and must be stored securely by the user.',
  })
  recoveryCodes: string[];
}
