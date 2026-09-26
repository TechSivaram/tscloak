import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'my-client',
    description:
      'The client ID of the application where the user account exists.',
  })
  @IsString()
  clientId: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'The email address associated with the user account.',
  })
  @IsEmail()
  email: string;
}
