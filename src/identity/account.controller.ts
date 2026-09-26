import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { OidcAuthGuard } from 'src/security/guards/oidc-auth.guard';
import type { AuthenticatedRequest } from 'src/security/types/authenticated-request';

import { UserCredentialsGuard } from 'src/security/guards/user-credentials.guard';

import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordResponseDto } from './dto/forgot-password-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { IdentityService } from './identity.service';

@ApiTags('Account')
@Controller('account')
export class AccountController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * Self-service password change for an authenticated user.
   */
  @Post('change-password')
  @UseGuards(OidcAuthGuard, UserCredentialsGuard)
  @ApiOperation({
    summary: 'Change the password of the authenticated user',
    description:
      'Changes the password of the currently authenticated user. The user ID and client ID are obtained from the validated access token and cannot be supplied by the caller. Client credentials tokens are not allowed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password changed successfully.',
    schema: {
      example: {
        message: 'Password changed successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'New password and confirmation password do not match, or the new password is the same as the current password.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed or the current password is incorrect.',
  })
  @ApiResponse({
    status: 403,
    description:
      'The access token represents a client rather than a logged-in user.',
  })
  @ApiResponse({
    status: 404,
    description: 'The authenticated user was not found or is disabled.',
  })
  @UseGuards(OidcAuthGuard, UserCredentialsGuard)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation password do not match',
      );
    }

    await this.identityService.changePassword(
      request.user.id,
      request.user.clientId,
      dto.currentPassword,
      dto.newPassword,
    );

    return {
      message: 'Password changed successfully',
    };
  }

  /**
   * Starts the self-service forgot-password flow.
   *
   * This endpoint intentionally does not require authentication.
   */
  @Post('forgot-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Request a password reset',
    description:
      'Starts the self-service password reset flow. If the specified account exists, TSCloak sends a password reset email. The response is intentionally identical whether or not the account exists to prevent account enumeration.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Password reset request accepted. The response does not reveal whether the account exists.',
    type: ForgotPasswordResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'The request contains an invalid client ID or email address.',
  })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    await this.identityService.requestPasswordReset(dto.clientId, dto.email);

    return {
      message: 'If an account exists, a password reset link has been sent.',
    };
  }

  @Post('reset-password')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reset password using a password reset token',
    description:
      'Resets a user password using the one-time token received by email. Authentication is not required because the reset token identifies the account.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully.',
    schema: {
      example: {
        message: 'Password reset successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'The reset token is invalid, expired, already used, or the passwords do not match.',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'New password and confirmation password do not match',
      );
    }

    await this.identityService.resetPassword(dto.token, dto.newPassword);

    return {
      message: 'Password reset successfully',
    };
  }
}
