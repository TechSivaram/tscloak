import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If an account exists, a password reset link has been sent.',
    description:
      'Generic response returned regardless of whether the account exists. This prevents account enumeration.',
  })
  message: string;
}
