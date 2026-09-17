import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateClientDto } from './create-client.dto';

export class UpdateClientDto extends PartialType(CreateClientDto) {
	@ApiPropertyOptional({
		description: 'Whether the client may use the OIDC provider.',
		default: true,
	})
	@IsOptional()
	@IsBoolean()
	enabled?: boolean;
}
