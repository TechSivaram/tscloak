import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export enum OidcMfaMethod {
  TOTP = 'totp',
  RECOVERY = 'recovery',
}

export class VerifyOidcMfaDto {
  @ApiProperty({
    enum: OidcMfaMethod,
    example: OidcMfaMethod.TOTP,
    description: 'MFA verification method.',
  })
  @IsEnum(OidcMfaMethod)
  method: OidcMfaMethod;

  @ApiProperty({
    example: '123456',
    description: 'TOTP code or recovery code.',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
