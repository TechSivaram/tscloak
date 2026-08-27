import { ApiProperty } from '@nestjs/swagger';

export class ClientResponseDto {
  @ApiProperty({
    example: '8b8a0d...',
  })
  id: string;

  @ApiProperty({
    example: '4e1a...',
  })
  clientId: string;

  @ApiProperty({
    example: 'My Web Application',
  })
  name: string;

  @ApiProperty({
    example: [
      'http://localhost:4200/callback',
    ],
  })
  redirectUris: string[];

  @ApiProperty({
    example: [
      'openid',
      'profile',
      'email',
    ],
  })
  allowedScopes: string[];

  @ApiProperty({
    example: [
      'authorization_code',
    ],
  })
  grantTypes: string[];

  @ApiProperty({
    example: [
      'code',
    ],
  })
  responseTypes: string[];

  @ApiProperty({
    example: 'none',
  })
  tokenEndpointAuthMethod: string;

  @ApiProperty({
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    example: 'secret-value',
    required: false,
  })
  clientSecret?: string;
}