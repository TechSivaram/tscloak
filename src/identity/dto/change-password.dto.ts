import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword123!',
    description: 'The current password of the authenticated user.',
  })
  @IsString()
  currentPassword: string;

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
