import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class CreateInitialAccessTokenDto {
  @ApiPropertyOptional({
    example: 'client-admin@example.com',
    description:
      'Optional email address. If provided, the generated initial access token will be sent to this address.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
