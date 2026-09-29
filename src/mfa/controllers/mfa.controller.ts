import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import { UserCredentialsGuard } from 'src/security/guards/user-credentials.guard';
import type { AuthenticatedRequest } from 'src/security/types/authenticated-request';
import { DisableMfaResponseDto } from '../dto/disable-mfa-response.dto';
import { DisableMfaDto } from '../dto/disable-mfa.dto';
import { EnrollMfaResponseDto } from '../dto/enroll-mfa-response.dto';
import { MfaStatusResponseDto } from '../dto/mfa-status-response.dto';
import { RegenerateRecoveryCodesResponseDto } from '../dto/regenerate-recovery-codes-response.dto';
import { RegenerateRecoveryCodesDto } from '../dto/regenerate-recovery-codes.dto';
import { VerifyMfaDto } from '../dto/verify-mfa.dto';
import { MfaAttemptRateLimitService } from '../services/mfa-attempt-rate-limit.service';
import { MfaService } from '../services/mfa.service';
@ApiTags('MFA')
@Controller('mfa')
@UseGuards(OidcAuthGuard, UserCredentialsGuard)
export class MfaController {
  constructor(
    private readonly mfaAttemptRateLimitService: MfaAttemptRateLimitService,
    private readonly mfaService: MfaService,
  ) {}

  @Post('enroll')
  @ApiOperation({
    summary: 'Start MFA enrollment',
    description:
      'Starts TOTP MFA enrollment for the authenticated user. MFA remains disabled until the generated TOTP code is successfully verified.',
  })
  @ApiResponse({
    status: 201,
    description: 'MFA enrollment started successfully.',
    type: EnrollMfaResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'MFA enrollment request is invalid.',
  })
  @ApiForbiddenResponse({
    description: 'The request is not associated with an authenticated user.',
  })
  async enroll(
    @Req() request: AuthenticatedRequest,
  ): Promise<EnrollMfaResponseDto> {
    return this.mfaService.startEnrollment(request.user.id, request.user.id);
  }

  @Post('enroll/verify')
  async verifyEnrollment(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyMfaDto,
  ) {
    const userId = request.user.id;
    const key = this.getRateLimitKey(userId);

    this.mfaAttemptRateLimitService.assertAllowed(key);

    try {
      const result = await this.mfaService.completeEnrollment(userId, dto.code);

      this.mfaAttemptRateLimitService.reset(key);

      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message === 'Invalid MFA verification code'
      ) {
        this.mfaAttemptRateLimitService.recordFailure(key);
      }

      throw error;
    }
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get MFA status',
    description:
      'Returns the MFA status of the authenticated user without exposing secrets or recovery codes.',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA status returned successfully.',
    type: MfaStatusResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication is required.',
  })
  async getStatus(
    @Req() request: AuthenticatedRequest,
  ): Promise<MfaStatusResponseDto> {
    const userId = request.user.id;

    return this.mfaService.getStatus(userId);
  }

  @Post('disable')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Disable MFA',
    description:
      'Disables TOTP MFA for the authenticated user after verifying the current TOTP code. The stored TOTP secret and all recovery codes are permanently removed.',
  })
  @ApiResponse({
    status: 201,
    description: 'MFA was disabled successfully.',
    type: DisableMfaResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'MFA is not enabled or the supplied TOTP verification code is invalid.',
  })
  @ApiForbiddenResponse({
    description: 'The request is not associated with an authenticated user.',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many MFA verification attempts. Please try again later.',
  })
  async disable(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DisableMfaDto,
  ): Promise<DisableMfaResponseDto> {
    const userId = request.user.id;
    const key = this.getRateLimitKey(userId);

    this.mfaAttemptRateLimitService.assertAllowed(key);

    try {
      const result = await this.mfaService.disableMfa(userId, dto.code);

      this.mfaAttemptRateLimitService.reset(key);

      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message === 'Invalid MFA verification code'
      ) {
        this.mfaAttemptRateLimitService.recordFailure(key);
      }

      throw error;
    }
  }

  @Post('recovery-codes/regenerate')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Regenerate MFA recovery codes',
    description:
      'Generates a new set of recovery codes after verifying the current TOTP code. All previously generated recovery codes are invalidated. The new codes are returned only in this response.',
  })
  @ApiResponse({
    status: 201,
    description: 'Recovery codes regenerated successfully.',
    type: RegenerateRecoveryCodesResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'MFA is not enabled or the supplied TOTP verification code is invalid.',
  })
  @ApiForbiddenResponse({
    description: 'The request is not associated with an authenticated user.',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many MFA verification attempts. Please try again later.',
  })
  async regenerateRecoveryCodes(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegenerateRecoveryCodesDto,
  ): Promise<RegenerateRecoveryCodesResponseDto> {
    const userId = request.user.id;
    const key = this.getRateLimitKey(userId);

    this.mfaAttemptRateLimitService.assertAllowed(key);

    try {
      const result = await this.mfaService.regenerateRecoveryCodes(
        userId,
        dto.code,
      );

      this.mfaAttemptRateLimitService.reset(key);

      return result;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message === 'Invalid MFA verification code'
      ) {
        this.mfaAttemptRateLimitService.recordFailure(key);
      }

      throw error;
    }
  }
  private getRateLimitKey(userId: string): string {
    return `mfa:user:${userId}`;
  }
}
