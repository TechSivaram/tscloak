import { ApiProperty } from '@nestjs/swagger';

export class FederationProviderResponseDto {
  @ApiProperty({
    example: '7c8d9e10-1234-4567-8901-234567890abc',
  })
  id: string;

  @ApiProperty({
    example: 'Google',
  })
  name: string;

  @ApiProperty({
    example: 'oidc',
  })
  type: string;

  @ApiProperty({
    example: 'https://accounts.google.com',
  })
  issuer: string;

  @ApiProperty({
    example: '123456789.apps.googleusercontent.com',
  })
  clientId: string;

  @ApiProperty({
    example: ['openid', 'profile', 'email'],
  })
  scopes: string[];

  @ApiProperty({
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    example: '2026-09-27T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-09-27T12:00:00.000Z',
  })
  updatedAt: Date;
}
