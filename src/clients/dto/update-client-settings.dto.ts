import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateClientDto } from './create-client.dto';

export class UpdateClientSettingsDto extends PartialType(
	OmitType(CreateClientDto, ['portalType'] as const),
) {}
