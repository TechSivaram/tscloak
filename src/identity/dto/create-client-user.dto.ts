import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateClientUserDto {
  @ApiProperty({
    example: 'john',
    description: 'Unique username for the user within the client.',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address of the user.',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Secret123!',
    description: 'Initial password for the user.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
