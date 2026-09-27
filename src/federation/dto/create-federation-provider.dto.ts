import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    IsIn,
} from 'class-validator';

export class CreateFederationProviderDto {
  @ApiProperty({
    example: 'Google',
    description: 'Display name of the federation provider.',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'oidc',
    description: 'Federation protocol used by the provider.',
  })
  @IsIn(['oidc'])
  type: string;

  @ApiProperty({
    example: 'https://accounts.google.com',
    description: 'OIDC issuer URL.',
  })
  @IsUrl()
  @IsNotEmpty()
  issuer: string;

  @ApiProperty({
    example: '123456789.apps.googleusercontent.com',
    description: 'OAuth/OIDC client ID registered with the provider.',
  })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({
    example: 'your-client-secret',
    description: 'OAuth/OIDC client secret registered with the provider.',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  clientSecret: string;

  @ApiPropertyOptional({
    example: ['openid', 'profile', 'email'],
    default: ['openid', 'profile', 'email'],
    description: 'Scopes requested from the federation provider.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Whether this federation provider is enabled.',
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
