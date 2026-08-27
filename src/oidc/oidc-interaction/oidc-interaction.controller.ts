import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';

import type { Response } from 'express';

import {
  OidcInteraction,
  OidcService,
  type InteractionHelper,
} from 'nest-oidc-provider';

import { AuthenticationService } from '../../authentication/authentication.service';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface LoginDto {
  username: string;
  password: string;
}

@Controller('interaction')
export class OidcInteractionController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly oidcService: OidcService,
  ) {}

  // ============================================================
  // GET /interaction/:uid
  // ============================================================

  @Get(':uid')
  async interactionPage(
    @Param('uid') uid: string,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    const details = await interaction.details();

    // ==========================================================
    // LOGIN
    // ==========================================================

    if (details.prompt?.name === 'login') {
      const template = await readFile(
        join(
          process.cwd(),
          'src',
          'oidc',
          'views',
          'login.html',
        ),
        'utf8',
      );

      const html = template
        .replaceAll(
          '{{UID}}',
          encodeURIComponent(uid),
        )
        .replaceAll(
          '{{ERROR}}',
          '',
        );

      response
        .status(200)
        .type('html')
        .send(html);

      return;
    }

    // ==========================================================
    // CONSENT
    // ==========================================================

    if (details.prompt?.name === 'consent') {
      const accountId =
        details.session?.accountId;

      const clientId =
        details.params?.client_id;

      if (
        typeof accountId !== 'string' ||
        !accountId
      ) {
        throw new Error(
          'OIDC consent: accountId is missing',
        );
      }

      if (
        typeof clientId !== 'string' ||
        !clientId
      ) {
        throw new Error(
          'OIDC consent: client_id is missing',
        );
      }

      // --------------------------------------------------------
      // Requested scopes
      // --------------------------------------------------------

      const requestedScopes =
        details.params?.scope
          ?.split(' ')
          .filter(Boolean) ?? [];

      // --------------------------------------------------------
      // Approve OIDC scopes.
      // --------------------------------------------------------

      const oidcScopes =
        requestedScopes.filter(
          (scope) =>
            scope === 'openid' ||
            scope === 'profile' ||
            scope === 'email',
        );

      // --------------------------------------------------------
      // Create Grant
      // --------------------------------------------------------

      const grant =
        new this.oidcService.provider.Grant({
          accountId,
          clientId,
        });

      // --------------------------------------------------------
      // Add approved scopes.
      // --------------------------------------------------------

      if (oidcScopes.length > 0) {
        grant.addOIDCScope(
          oidcScopes.join(' '),
        );
      }

      // --------------------------------------------------------
      // Save Grant
      // --------------------------------------------------------

      const grantId =
        await grant.save();

      // ========================================================
      // Read Grant back
      // ========================================================

      const savedGrant =
        await this.oidcService.provider.Grant.find(
          grantId,
        );

      if (!savedGrant) {
        throw new Error(
          `OIDC Grant ${grantId} could not be read back`,
        );
      }

      // ========================================================
      // IMPORTANT
      //
      // This is the result consumed by oidc-provider's
      // authorization resume pipeline.
      //
      // loadExistingGrant() will use:
      //
      // result.consent.grantId
      //
      // ========================================================

      const consentResult = {
        consent: {
          grantId,
        },
      };

      // --------------------------------------------------------
      // Finish consent interaction
      // --------------------------------------------------------

      try {
        await interaction.finished(
          consentResult,
        );
      } catch (error) {
        throw error;
      }

      return;
    }

    // ==========================================================
    // UNKNOWN INTERACTION
    // ==========================================================

    response
      .status(400)
      .send(
        'Unsupported OIDC interaction',
      );
  }

  // ============================================================
  // POST /interaction/:uid
  //
  // Login form submits here.
  // ============================================================

  @Post(':uid')
  async login(
    @Param('uid') uid: string,

    @Body() dto: LoginDto,

    @OidcInteraction()
    interaction: InteractionHelper,
  ): Promise<void> {
    const details =
      await interaction.details();

    // ==========================================================
    // Make sure this is LOGIN interaction
    // ==========================================================

    if (details.prompt?.name !== 'login') {
      await interaction.finished({
        error: 'invalid_request',
        error_description:
          'Invalid interaction for login endpoint',
      });

      return;
    }

    // ==========================================================
    // Authenticate user
    // ==========================================================

    const user =
      await this.authenticationService.authenticate(
        dto.username,
        dto.password,
      );

    // ==========================================================
    // Finish LOGIN interaction
    // ==========================================================

    const loginResult = {
      login: {
        accountId: user.id,
        remember: true,
        ts: Math.floor(
          Date.now() / 1000,
        ),
      },
    };

    try {
      await interaction.finished(
        loginResult,
      );
    } catch (error) {
      throw error;
    }
  }
}