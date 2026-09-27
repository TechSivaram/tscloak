import { ApiProperty } from '@nestjs/swagger';

export class ClientFederationProviderResponseDto {
  @ApiProperty({ example: '7c8d9e10-1234-4567-8901-234567890abc' })
  id: string;

  @ApiProperty({ example: 'Google' })
  name: string;

  @ApiProperty({ example: 'oidc' })
  type: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ example: true })
  availableGlobally: boolean;
}
