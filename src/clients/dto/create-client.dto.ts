import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateClientDto {
  @ApiProperty({
    example: 'My Web Application',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: [
      'http://localhost:4200/callback',
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({
    require_tld: false,
  }, {
    each: true,
  })
  redirectUris: string[];

  @ApiProperty({
    example: [
      'openid',
      'profile',
      'email',
    ],
  })
  @IsArray()
  allowedScopes: string[];

  @ApiProperty({
    example: [
      'authorization_code',
    ],
  })
  @IsArray()
  grantTypes: string[];

  @ApiProperty({
    example: [
      'code',
    ],
  })
  @IsArray()
  responseTypes: string[];

  @ApiProperty({
    example: 'none',
    enum: [
      'none',
      'client_secret_basic',
      'client_secret_post',
    ],
  })
  @IsString()
  @IsIn([
    'none',
    'client_secret_basic',
    'client_secret_post',
  ])
  tokenEndpointAuthMethod: string;
}