import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateInitialAccessTokenDto {
  /**
   * Friendly name for identifying the token.
   */
  @IsString()
  name: string;

  /**
   * Maximum number of clients that can be registered.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  maxRegistrations?: number;

  /**
   * Optional expiration date.
   *
   * Example:
   * 2026-12-31T23:59:59.000Z
   */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
