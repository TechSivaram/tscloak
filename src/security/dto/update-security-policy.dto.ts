import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class UpdateSecurityPolicyDto {
  // =========================
  // Token Policy
  // =========================

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  accessTokenTtl?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  idTokenTtl?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(600)
  authorizationCodeTtl?: number;

  @IsOptional()
  @IsInt()
  @Min(3600)
  @Max(60 * 60 * 24 * 90)
  refreshTokenTtl?: number;

  // =========================
  // Refresh Token Policy
  // =========================

  @IsOptional()
  @IsBoolean()
  refreshTokenRotationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  refreshTokenReuseDetectionEnabled?: boolean;

  // =========================
  // Session Policy
  // =========================

  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(60 * 60 * 24 * 30)
  sessionTtl?: number;

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  interactionTtl?: number;
}