import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientResponseDto {
  @ApiProperty({
    example: '8b8a0d12-1234-4567-8901-abcdef123456',
    description: 'Internal TSCloak client record ID.',
  })
  id: string;

  @ApiProperty({
    example: '4e1a7c9d2f8b6a5c',
    description: 'OAuth/OIDC client identifier.',
  })
  clientId: string;

  @ApiProperty({
    example: 'My Web Application',
    description: 'Display name of the OAuth/OIDC client.',
  })
  name: string;

  @ApiProperty({
    example: ['http://localhost:4200/callback'],
    description: 'Allowed redirect URIs for the client.',
    type: [String],
  })
  redirectUris: string[];

  @ApiPropertyOptional({
    example: ['https://app.example.com/logout/callback'],
    description: 'Allowed redirect URIs after RP-initiated logout.',
    type: [String],
  })
  postLogoutRedirectUris: string[];

  @ApiProperty({
    example: ['openid', 'profile', 'email'],
    description: 'OAuth/OIDC scopes allowed for the client.',
    type: [String],
  })
  allowedScopes: string[];

  @ApiProperty({
    example: ['authorization_code', 'refresh_token'],
    description: 'OAuth/OIDC grant types allowed for the client.',
    type: [String],
  })
  grantTypes: string[];

  @ApiProperty({
    example: ['code'],
    description: 'OAuth/OIDC response types allowed for the client.',
    type: [String],
  })
  responseTypes: string[];

  @ApiProperty({
    example: 'none',
    enum: ['none', 'client_secret_basic', 'client_secret_post'],
    description: 'Client authentication method used at the token endpoint.',
  })
  tokenEndpointAuthMethod: string;

  @ApiProperty({
    example: 'HOSTED',
    enum: ['HOSTED', 'EXTERNAL'],
    description:
      'Determines where OIDC login and consent interactions are rendered.',
  })
  interactionMode: string;

  @ApiPropertyOptional({
    example: 'https://app.example.com/auth/login',
    description:
      'External login page URL. Used when interaction mode is EXTERNAL.',
  })
  interactionLoginUrl?: string;

  @ApiPropertyOptional({
    example: 'https://app.example.com/auth/consent',
    description:
      'External consent page URL. Used when interaction mode is EXTERNAL.',
  })
  interactionConsentUrl?: string;

  @ApiProperty({
    example: true,
    description: 'Indicates whether the client is enabled.',
  })
  enabled: boolean;
}
