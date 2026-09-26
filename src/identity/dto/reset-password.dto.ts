import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: '7e7c8c0d8e...',
    description:
      'The one-time password reset token received in the password reset email.',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'NewPassword456!',
    description: 'The new password.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({
    example: 'NewPassword456!',
    description: 'Confirmation of the new password.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  confirmPassword: string;
}
