import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateClientFederationProviderDto {
  @ApiProperty({
    example: true,
    description:
      'Whether this provider is enabled for the authenticated client.',
  })
  @IsBoolean()
  enabled: boolean;
}
