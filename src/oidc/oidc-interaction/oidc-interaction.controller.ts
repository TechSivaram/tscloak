import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  OidcInteraction,
  OidcService,
  type InteractionHelper,
} from 'nest-oidc-provider';

import { AuthenticationService } from '../../authentication/authentication.service';
import { ClientsService } from '../../clients/clients.service';
import { InteractionMode } from '../../clients/enums/interaction-mode.enum';
import { FederationService } from '../../federation/federation.service';
import { MfaService } from '../../mfa/services/mfa.service';
import { OidcMfaChallengeService } from '../services/oidc-mfa-challenge.service';
import { renderFederationLoginButton } from './federation-login-button';

import type { Response } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  OidcMfaMethod,
  VerifyOidcMfaDto,
} from 'src/mfa/dto/verify-oidc-mfa.dto';
import { MfaAttemptRateLimitService } from 'src/mfa/services/mfa-attempt-rate-limit.service';

interface LoginDto {
  username: string;
  password: string;
}

interface ConsentDto {
  decision: 'accept' | 'reject';
}

interface ScopeInfo {
  name: string;
  description: string;
}

@ApiTags('Hosted UI')
@Controller('interaction')
export class OidcInteractionController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly oidcService: OidcService,
    private readonly clientsService: ClientsService,
    private readonly federationService: FederationService,
    private readonly mfaService: MfaService,
    private readonly oidcMfaChallengeService: OidcMfaChallengeService,
    private readonly mfaAttemptRateLimitService: MfaAttemptRateLimitService,
  ) {}

  // ============================================================
  // GET /interaction/:uid
  // ============================================================

  @Get(':uid')
  @ApiOperation({
    summary: 'Display Hosted UI',
    description:
      'Displays the TSCloak Hosted UI for an OIDC login or consent interaction. If the client is configured for an external interaction UI, the request is redirected to the configured external URL.',
  })
  @ApiParam({
    name: 'uid',
    description: 'OIDC interaction identifier.',
    example: '4f8b7c9a6d2e4f1a',
  })
  @ApiResponse({
    status: 200,
    description: 'Hosted UI HTML page returned.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirected to an externally configured interaction UI.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or unsupported OIDC interaction.',
  })
  async interactionPage(
    @Param('uid') uid: string,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    const details = await interaction.details();

    const clientId = details.params?.client_id;
    const prompt = details.prompt?.name;

    // ==========================================================
    // LOAD CLIENT
    // ==========================================================

    const client =
      typeof clientId === 'string' && clientId
        ? await this.clientsService.findByClientId(clientId)
        : null;

    // ==========================================================
    // EXTERNAL INTERACTION UI
    // ==========================================================

    if (client?.interactionMode === InteractionMode.EXTERNAL) {
      let externalInteractionUrl: string | null = null;

      if (prompt === 'login') {
        externalInteractionUrl = client.interactionLoginUrl;
      } else if (prompt === 'consent') {
        externalInteractionUrl = client.interactionConsentUrl;
      }

      if (externalInteractionUrl) {
        const interactionUrl = new URL(externalInteractionUrl);

        interactionUrl.searchParams.set('interaction_uid', uid);

        interactionUrl.searchParams.set('prompt', prompt ?? '');

        interactionUrl.searchParams.set('client_id', String(clientId ?? ''));

        response.redirect(interactionUrl.toString());

        return;
      }
    }

    // ==========================================================
    // HOSTED LOGIN UI
    // ==========================================================

    if (prompt === 'login') {
      const redirectUri =
        typeof details.params?.redirect_uri === 'string'
          ? details.params.redirect_uri
          : '';

      const pendingMfa = await this.oidcMfaChallengeService.get(uid);

      if (pendingMfa) {
        const html = await this.renderMfaPage(
          uid,
          typeof clientId === 'string' ? clientId : '',
          '',
        );

        response.status(200).type('html').send(html);
        return;
      }

      const html = await this.renderLoginPage(
        uid,
        typeof clientId === 'string' ? clientId : '',
        redirectUri,
        '',
      );

      response.status(200).type('html').send(html);

      return;
    }

    // ==========================================================
    // HOSTED CONSENT UI
    // ==========================================================

    if (prompt === 'consent') {
      const accountId = details.session?.accountId;

      if (typeof accountId !== 'string' || !accountId) {
        throw new Error('OIDC consent: accountId is missing');
      }

      if (typeof clientId !== 'string' || !clientId) {
        throw new Error('OIDC consent: client_id is missing');
      }

      // --------------------------------------------------------
      // REQUESTED SCOPES
      // --------------------------------------------------------

      const requestedScopes =
        details.params?.scope?.split(' ').filter(Boolean) ?? [];

      // --------------------------------------------------------
      // MISSING SCOPES
      // --------------------------------------------------------

      const missingOIDCScope = details.prompt?.details?.missingOIDCScope ?? [];

      // --------------------------------------------------------
      // MISSING CLAIMS
      // --------------------------------------------------------

      const missingOIDCClaims =
        details.prompt?.details?.missingOIDCClaims ?? [];

      // --------------------------------------------------------
      // LOAD CONSENT TEMPLATE
      // --------------------------------------------------------

      const template = await readFile(
        join(process.cwd(), 'src', 'oidc', 'views', 'consent.html'),
        'utf8',
      );

      // --------------------------------------------------------
      // BUILD REQUESTED SCOPES HTML
      // --------------------------------------------------------

      const scopesHtml = requestedScopes
        .map((scope) => {
          const scopeInfo = this.getScopeDescription(scope);

          return `
              <li class="scope-item">
                <div class="scope-name">
                  ${this.escapeHtml(scopeInfo.name)}
                </div>
                <div class="scope-description">
                  ${this.escapeHtml(scopeInfo.description)}
                </div>
              </li>
            `;
        })
        .join('');

      // --------------------------------------------------------
      // BUILD MISSING SCOPES HTML
      // --------------------------------------------------------

      const missingScopesHtml = Array.isArray(missingOIDCScope)
        ? missingOIDCScope
            .map((scope) => {
              const scopeInfo = this.getScopeDescription(String(scope));

              return `
                  <li class="scope-item">
                    <div class="scope-name">
                      ${this.escapeHtml(scopeInfo.name)}
                    </div>
                    <div class="scope-description">
                      ${this.escapeHtml(scopeInfo.description)}
                    </div>
                  </li>
                `;
            })
            .join('')
        : '';

      // --------------------------------------------------------
      // BUILD MISSING CLAIMS HTML
      // --------------------------------------------------------

      const missingClaimsHtml = Array.isArray(missingOIDCClaims)
        ? missingOIDCClaims
            .map((claim) => `<li>${this.escapeHtml(String(claim))}</li>`)
            .join('')
        : '';

      // --------------------------------------------------------
      // RENDER CONSENT PAGE
      // --------------------------------------------------------

      const html = template
        .replaceAll('{{UID}}', encodeURIComponent(uid))
        .replaceAll('{{clientName}}', this.escapeHtml(client?.name ?? clientId))
        .replaceAll('{{CLIENT_ID}}', this.escapeHtml(clientId))
        .replaceAll('{{scopes}}', scopesHtml)
        .replaceAll('{{MISSING_SCOPES}}', missingScopesHtml)
        .replaceAll('{{MISSING_CLAIMS}}', missingClaimsHtml)
        .replaceAll('{{ERROR}}', '');

      response.status(200).type('html').send(html);

      return;
    }

    // ============================================================
    // UNSUPPORTED INTERACTION
    // ============================================================

    throw new Error(`Unsupported OIDC interaction prompt: ${prompt}`);
  }

  // ============================================================
  // POST /interaction/:uid/login
  // HOSTED LOGIN
  // ============================================================

  @Post(':uid/login')
  @ApiOperation({
    summary: 'Hosted UI Login',
    description:
      'Authenticates the user through the TSCloak Hosted UI and completes the OIDC login interaction.',
  })
  @ApiParam({
    name: 'uid',
    description: 'OIDC interaction identifier.',
    example: '4f8b7c9a6d2e4f1a',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          example: 'siva',
          description: 'Username.',
        },
        password: {
          type: 'string',
          format: 'password',
          example: 'Password123!',
          description: 'User password.',
        },
      },
      required: ['username', 'password'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OIDC login interaction completed.',
  })
  @ApiResponse({
    status: 400,
    description: 'The endpoint is not handling a login interaction.',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed.',
  })
  async login(
    @Param('uid') uid: string,

    @Body() dto: LoginDto,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    try {
      const details = await interaction.details();

      if (details.prompt?.name !== 'login') {
        response
          .status(400)
          .send('This endpoint is not handling a login interaction.');

        return;
      }

      const user = await this.authenticationService.authenticate(
        dto.username,
        dto.password,
        details.params.client_id,
        details.params.redirect_uri,
      );

      const userMfa = await this.mfaService.getUserMfa(user.id);

      if (userMfa?.enabled) {
        await this.oidcMfaChallengeService.create(uid, user.id);

        const clientId =
          typeof details.params?.client_id === 'string'
            ? details.params.client_id
            : '';

        const html = await this.renderMfaPage(uid, clientId, '');

        response.status(200).type('html').send(html);
        return;
      }

      await interaction.finished({
        login: {
          accountId: user.id,
          remember: true,
          ts: Math.floor(Date.now() / 1000),
          amr: ['pwd'],
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';

      const details = await interaction.details();

      const clientId =
        typeof details.params?.client_id === 'string'
          ? details.params.client_id
          : '';
      const redirectUri =
        typeof details.params?.redirect_uri === 'string'
          ? details.params.redirect_uri
          : '';
      const html = await this.renderLoginPage(
        uid,
        clientId,
        redirectUri,
        this.escapeHtml(message),
      );

      response.status(401).type('html').send(html);
    }
  }

  // ============================================================
  // POST /interaction/:uid/mfa
  // HOSTED MFA VERIFICATION
  // ============================================================

  @Post(':uid/mfa')
  @ApiOperation({
    summary: 'Hosted UI MFA Verification',
    description:
      'Verifies the pending MFA challenge using a TOTP or one-time recovery code and completes the OIDC login interaction only after successful verification.',
  })
  @ApiParam({
    name: 'uid',
    description: 'OIDC interaction identifier.',
    example: '4f8b7c9a6d2e4f1a',
  })
  @ApiBody({
    type: VerifyOidcMfaDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'MFA verification succeeded and the OIDC login interaction was completed.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or unsupported MFA interaction.',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired MFA challenge or verification code.',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many MFA verification attempts. Please try again later.',
  })
  async verifyMfa(
    @Param('uid') uid: string,
    @Body() dto: VerifyOidcMfaDto,
    @OidcInteraction()
    interaction: InteractionHelper,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const details = await interaction.details();

      if (details.prompt?.name !== 'login') {
        response
          .status(400)
          .send('This endpoint is not handling a login interaction.');

        return;
      }

      const challenge = await this.oidcMfaChallengeService.require(uid);

      const key = `oidc-mfa:${uid}:${challenge.userId}`;

      this.mfaAttemptRateLimitService.assertAllowed(key);

      const clientId =
        typeof details.params?.client_id === 'string'
          ? details.params.client_id
          : '';

      let valid = false;

      if (dto.method === OidcMfaMethod.TOTP) {
        valid = await this.mfaService.verifyTotp(challenge.userId, dto.code);
      } else if (dto.method === OidcMfaMethod.RECOVERY) {
        valid = await this.mfaService.verifyRecoveryCode(
          challenge.userId,
          dto.code,
        );
      }

      if (!valid) {
        this.mfaAttemptRateLimitService.recordFailure(key);

        const html = await this.renderMfaPage(
          uid,
          clientId,
          'Invalid MFA code. Please try again.',
        );

        response.status(401).type('html').send(html);

        return;
      }

      await interaction.finished({
        login: {
          accountId: challenge.userId,
          remember: true,
          ts: Math.floor(Date.now() / 1000),
          amr: ['pwd', 'otp'],
        },
      });

      this.mfaAttemptRateLimitService.reset(key);

      await this.oidcMfaChallengeService.remove(uid);
    } catch (error) {
      /*
       * Preserve HTTP 429 from the MFA attempt rate limiter.
       * Do not convert it into the normal 401 MFA error response.
       */
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        const details = await interaction.details();

        const clientId =
          typeof details.params?.client_id === 'string'
            ? details.params.client_id
            : '';

        const html = await this.renderMfaPage(
          uid,
          clientId,
          'Too many MFA verification attempts. Please try again later.',
        );

        response.status(HttpStatus.TOO_MANY_REQUESTS).type('html').send(html);

        return;
      }

      const message =
        error instanceof Error ? error.message : 'MFA verification failed';

      const details = await interaction.details();

      const clientId =
        typeof details.params?.client_id === 'string'
          ? details.params.client_id
          : '';

      const html = await this.renderMfaPage(
        uid,
        clientId,
        this.escapeHtml(message),
      );

      response.status(401).type('html').send(html);
    }
  }

  // ============================================================
  // POST /interaction/:uid/consent
  // HOSTED CONSENT
  // ============================================================

  @Post(':uid/consent')
  @ApiOperation({
    summary: 'Hosted UI Consent',
    description:
      'Processes the user consent decision through the TSCloak Hosted UI and completes the OIDC consent interaction.',
  })
  @ApiParam({
    name: 'uid',
    description: 'OIDC interaction identifier.',
    example: '4f8b7c9a6d2e4f1a',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['accept', 'reject'],
          example: 'accept',
          description: 'User consent decision.',
        },
      },
      required: ['decision'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'OIDC consent interaction completed.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid consent interaction or decision.',
  })
  async consent(
    @Param('uid') uid: string,

    @Body() dto: ConsentDto,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    const details = await interaction.details();

    // ==========================================================
    // VALIDATE INTERACTION
    // ==========================================================

    if (details.prompt?.name !== 'consent') {
      response
        .status(400)
        .send('This endpoint is not handling a consent interaction.');

      return;
    }

    // ==========================================================
    // REJECT CONSENT
    // ==========================================================

    if (dto.decision === 'reject') {
      await interaction.finished({
        error: 'access_denied',
        error_description: 'User denied the consent request.',
      });

      return;
    }

    // ==========================================================
    // VALIDATE DECISION
    // ==========================================================

    if (dto.decision !== 'accept') {
      response.status(400).send('Invalid consent decision.');

      return;
    }

    const accountId = details.session?.accountId;

    const clientId = details.params?.client_id;

    const redirectUri = details.params?.redirect_uri;

    if (typeof accountId !== 'string' || !accountId) {
      throw new Error('OIDC consent: accountId is missing');
    }

    if (typeof clientId !== 'string' || !clientId) {
      throw new Error('OIDC consent: client_id is missing');
    }

    // ==========================================================
    // CREATE OR REUSE GRANT
    // ==========================================================

    let grant;

    if (details.grantId) {
      grant = await this.oidcService.provider.Grant.find(details.grantId);
    }

    if (!grant) {
      grant = new this.oidcService.provider.Grant({
        accountId,
        clientId,
      });
    }

    // ==========================================================
    // ADD MISSING OIDC SCOPES
    // ==========================================================

    const missingOIDCScope = details.prompt?.details?.missingOIDCScope ?? [];

    if (Array.isArray(missingOIDCScope) && missingOIDCScope.length > 0) {
      grant.addOIDCScope(missingOIDCScope.join(' '));
    }

    // ==========================================================
    // ADD MISSING OIDC CLAIMS
    // ==========================================================

    const missingOIDCClaims = details.prompt?.details?.missingOIDCClaims ?? [];

    if (Array.isArray(missingOIDCClaims) && missingOIDCClaims.length > 0) {
      grant.addOIDCClaims(missingOIDCClaims);
    }

    // Grant resource server scopes reported by oidc-provider's
    // consent policy.
    const missingResourceScopes =
      details.prompt?.details?.missingResourceScopes ?? {};

    if (
      missingResourceScopes &&
      typeof missingResourceScopes === 'object' &&
      !Array.isArray(missingResourceScopes)
    ) {
      for (const [resource, scopes] of Object.entries(missingResourceScopes)) {
        if (Array.isArray(scopes) && scopes.length > 0) {
          grant.addResourceScope(resource, scopes.map(String));
        }
      }
    }

    // ==========================================================
    // SAVE GRANT
    // ==========================================================

    const grantId = await grant.save();

    // ==========================================================
    // COMPLETE INTERACTION
    // ==========================================================

    await interaction.finished({
      consent: {
        grantId,
      },
    });
  }

  // ============================================================
  // SCOPE METADATA
  // ============================================================

  private getScopeDescription(scope: string): ScopeInfo {
    const scopes: Record<string, ScopeInfo> = {
      openid: {
        name: 'OpenID',
        description: 'Authenticate you and verify your identity.',
      },

      profile: {
        name: 'Profile',
        description:
          'Access your basic profile information, such as your name and profile details.',
      },

      email: {
        name: 'Email',
        description: 'Access your email address and email verification status.',
      },

      roles: {
        name: 'Roles',
        description: 'Access your assigned roles and permissions.',
      },

      offline_access: {
        name: 'Offline Access',
        description:
          'Maintain access when you are not actively using the application. This allows the application to request new access tokens using a refresh token.',
      },
    };

    return (
      scopes[scope] ?? {
        name: scope,
        description: `Access permission for ${scope}.`,
      }
    );
  }

  // ============================================================
  // HTML ESCAPING
  // ============================================================

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  private async renderMfaPage(
    uid: string,
    clientId: string,
    error: string,
  ): Promise<string> {
    const template = await readFile(
      join(process.cwd(), 'src', 'oidc', 'views', 'mfa.html'),
      'utf8',
    );

    const errorHtml = error
      ? `<div class="error">${this.escapeHtml(error)}</div>`
      : '';

    return template
      .replaceAll('{{UID}}', encodeURIComponent(uid))
      .replaceAll('{{CLIENT_ID}}', this.escapeHtml(clientId))
      .replaceAll('{{ERROR}}', errorHtml);
  }

  private async renderLoginPage(
    uid: string,
    clientId: string,
    redirectUri: string,
    error: string,
  ): Promise<string> {
    const template = await readFile(
      join(process.cwd(), 'src', 'oidc', 'views', 'login.html'),
      'utf8',
    );
    const federationProvidersHtml =
      clientId && redirectUri
        ? await this.renderFederationProviders(uid, clientId, redirectUri)
        : '';

    return template
      .replaceAll('{{UID}}', encodeURIComponent(uid))
      .replaceAll('{{CLIENT_ID}}', this.escapeHtml(clientId))
      .replaceAll('{{ERROR}}', error)
      .replaceAll('{{FEDERATION_PROVIDERS}}', federationProvidersHtml);
  }

  private async renderFederationProviders(
    uid: string,
    clientId: string,
    redirectUri: string,
  ): Promise<string> {
    const providers =
      await this.federationService.findEnabledProviderOptions(clientId);

    if (providers.length === 0) {
      return '';
    }

    const buttons = providers
      .map((provider) => {
        const query = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          interaction_uid: uid,
        });
        const authorizeUrl = `/api/federation/providers/${encodeURIComponent(provider.id)}/authorize?${query.toString()}`;

        return renderFederationLoginButton(provider.name, authorizeUrl);
      })
      .join('');

    return `
      <div class="federation-options">
        <div class="federation-divider"><span>or</span></div>
        <div class="federation-buttons">${buttons}</div>
      </div>
    `;
  }
}
