import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class UpdateSecurityPolicyDto {
  // =========================
  // Token Policy
  // =========================

  @ApiPropertyOptional({
    example: 900,
    description:
      'Access token lifetime in seconds.',
    minimum: 60,
    maximum: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  accessTokenTtl?: number;

  @ApiPropertyOptional({
    example: 900,
    description:
      'ID token lifetime in seconds.',
    minimum: 60,
    maximum: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  idTokenTtl?: number;

  @ApiPropertyOptional({
    example: 300,
    description:
      'Authorization code lifetime in seconds.',
    minimum: 60,
    maximum: 600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(600)
  authorizationCodeTtl?: number;

  @ApiPropertyOptional({
    example: 2592000,
    description:
      'Refresh token lifetime in seconds.',
    minimum: 3600,
    maximum: 7776000,
  })
  @IsOptional()
  @IsInt()
  @Min(3600)
  @Max(60 * 60 * 24 * 90)
  refreshTokenTtl?: number;

  @ApiPropertyOptional({
    example: 86400,
    description:
      'Initial access token lifetime in seconds. Initial access tokens are used for controlled client registration.',
    minimum: 60,
    maximum: 7776000,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(60 * 60 * 24 * 90)
  initialAccessTokenTtl?: number;

  @ApiPropertyOptional({
    example: 86400,
    description:
      'Registration access token lifetime in seconds.',
    minimum: 60,
    maximum: 7776000,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(60 * 60 * 24 * 90)
  registrationAccessTokenTtl?: number;

  // =========================
  // Refresh Token Policy
  // =========================

  @ApiPropertyOptional({
    example: true,
    description:
      'Controls whether refresh token rotation is enabled.',
  })
  @IsOptional()
  @IsBoolean()
  refreshTokenRotationEnabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Controls whether refresh token reuse detection is enabled.',
  })
  @IsOptional()
  @IsBoolean()
  refreshTokenReuseDetectionEnabled?: boolean;

  // =========================
  // Session Policy
  // =========================

  @ApiPropertyOptional({
    example: 604800,
    description:
      'User session lifetime in seconds.',
    minimum: 300,
    maximum: 2592000,
  })
  @IsOptional()
  @IsInt()
  @Min(300)
  @Max(60 * 60 * 24 * 30)
  sessionTtl?: number;

  @ApiPropertyOptional({
    example: 600,
    description:
      'OIDC interaction lifetime in seconds.',
    minimum: 60,
    maximum: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  interactionTtl?: number;
}