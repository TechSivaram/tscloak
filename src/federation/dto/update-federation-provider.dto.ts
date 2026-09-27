import { ApiPropertyOptional } from '@nestjs/swagger';

import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUrl,
    IsIn,
} from 'class-validator';

export class UpdateFederationProviderDto {
  @ApiPropertyOptional({
    example: 'Google',
    description: 'Display name of the federation provider.',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'oidc',
    description: 'Federation protocol used by the provider.',
  })
  @IsIn(['oidc'])
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    example: 'https://accounts.google.com',
    description: 'OIDC issuer URL.',
  })
  @IsUrl()
  @IsNotEmpty()
  @IsOptional()
  issuer?: string;

  @ApiPropertyOptional({
    example: '123456789.apps.googleusercontent.com',
    description: 'OAuth/OIDC client ID registered with the provider.',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({
    example: 'new-client-secret',
    description:
      'OAuth/OIDC client secret. If omitted, the existing secret is retained.',
    writeOnly: true,
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  clientSecret?: string;

  @ApiPropertyOptional({
    example: ['openid', 'profile', 'email'],
    description: 'Scopes requested from the federation provider.',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scopes?: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Whether this federation provider is enabled.',
  })
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
