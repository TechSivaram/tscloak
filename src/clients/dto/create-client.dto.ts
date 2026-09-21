import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { InteractionMode } from '../enums/interaction-mode.enum';

export class CreateClientDto {
  @ApiProperty({
    example: 'My Web Application',
    description: 'Display name of the OAuth/OIDC client.',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: ['http://localhost:4200/callback'],
    description: 'Allowed redirect URIs for the OAuth/OIDC client.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl(
    {
      require_tld: false,
    },
    {
      each: true,
    },
  )
  redirectUris: string[];

  @ApiPropertyOptional({
    example: ['https://app.example.com/logout/callback'],
    description: 'Allowed redirect URIs after RP-initiated logout.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl(
    {
      require_tld: false,
    },
    {
      each: true,
    },
  )
  postLogoutRedirectUris: string[];

  @ApiProperty({
    example: ['openid', 'profile', 'email'],
    description: 'OAuth/OIDC scopes allowed for the client.',
    type: [String],
  })
  @IsArray()
  allowedScopes: string[];

  @ApiProperty({
    example: ['authorization_code', 'refresh_token'],
    description: 'OAuth/OIDC grant types allowed for the client.',
    type: [String],
  })
  @IsArray()
  grantTypes: string[];

  @ApiProperty({
    example: ['code'],
    description: 'OAuth/OIDC response types allowed for the client.',
    type: [String],
  })
  @IsArray()
  responseTypes: string[];

  @ApiProperty({
    example: 'none',
    enum: ['none', 'client_secret_basic', 'client_secret_post'],
    description: 'Client authentication method used at the token endpoint.',
  })
  @IsString()
  @IsIn(['none', 'client_secret_basic', 'client_secret_post'])
  tokenEndpointAuthMethod: string;

  @ApiProperty({
    example: InteractionMode.HOSTED,
    enum: InteractionMode,
    description:
      'Determines where the OIDC login and consent interactions are rendered.',
    default: InteractionMode.HOSTED,
  })
  @IsEnum(InteractionMode)
  interactionMode: InteractionMode;

  @ApiPropertyOptional({
    example: 'https://app.example.com/auth/login',
    description:
      'External login page URL. Required when interaction mode is EXTERNAL.',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  interactionLoginUrl?: string;

  @ApiPropertyOptional({
    example: 'https://app.example.com/auth/consent',
    description:
      'External consent page URL. Required when interaction mode is EXTERNAL and consent is required.',
  })
  @IsOptional()
  @IsUrl({
    require_tld: false,
  })
  interactionConsentUrl?: string;
}
