import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RegenerateRecoveryCodesDto {
  @ApiProperty({
    example: '123456',
    description:
      'Current 6-digit TOTP code from the user authenticator application.',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;
}
