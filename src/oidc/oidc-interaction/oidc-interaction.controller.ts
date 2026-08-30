import {
  Body,
  Controller,
  Get,
  Inject,
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
import { ClientRepository } from '../../clients/repositories/client.repository';
import { InteractionMode } from '../../clients/enums/interaction-mode.enum';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

@Controller('interaction')
export class OidcInteractionController {
  constructor(
    private readonly authenticationService: AuthenticationService,
    private readonly oidcService: OidcService,

    @Inject(ClientRepository)
    private readonly clientRepository: ClientRepository,
  ) { }

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

    const clientId = details.params?.client_id;
    const prompt = details.prompt?.name;

    // ==========================================================
    // LOAD CLIENT
    // ==========================================================

    const client =
      typeof clientId === 'string' && clientId
        ? await this.clientRepository.findByClientId(clientId)
        : null;

    // ==========================================================
    // EXTERNAL INTERACTION UI
    // ==========================================================
    //
    // EXTERNAL mode:
    //
    // login   -> interactionLoginUrl
    // consent -> interactionConsentUrl
    //
    // If the corresponding URL is not configured,
    // fall back to the hosted TSCloak UI.
    // ==========================================================

    if (
      client?.interactionMode === InteractionMode.EXTERNAL
    ) {
      let externalInteractionUrl: string | null = null;

      if (prompt === 'login') {
        externalInteractionUrl =
          client.interactionLoginUrl;
      } else if (prompt === 'consent') {
        externalInteractionUrl =
          client.interactionConsentUrl;
      }

      if (externalInteractionUrl) {
        const interactionUrl = new URL(
          externalInteractionUrl,
        );

        interactionUrl.searchParams.set(
          'interaction_uid',
          uid,
        );

        interactionUrl.searchParams.set(
          'prompt',
          prompt ?? '',
        );

        interactionUrl.searchParams.set(
          'client_id',
          clientId,
        );

        response.redirect(
          interactionUrl.toString(),
        );

        return;
      }
    }

    // ==========================================================
    // HOSTED LOGIN UI
    // ==========================================================

    if (prompt === 'login') {
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
    // HOSTED CONSENT UI
    // ==========================================================

    if (prompt === 'consent') {
      const accountId =
        details.session?.accountId;

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
      // REQUESTED SCOPES
      // --------------------------------------------------------

      const requestedScopes =
        details.params?.scope
          ?.split(' ')
          .filter(Boolean) ?? [];

      // --------------------------------------------------------
      // MISSING SCOPES
      // --------------------------------------------------------

      const missingOIDCScope =
        details.prompt?.details
          ?.missingOIDCScope ?? [];

      // --------------------------------------------------------
      // MISSING CLAIMS
      // --------------------------------------------------------

      const missingOIDCClaims =
        details.prompt?.details
          ?.missingOIDCClaims ?? [];

      // --------------------------------------------------------
      // LOAD CONSENT TEMPLATE
      // --------------------------------------------------------

      const template = await readFile(
        join(
          process.cwd(),
          'src',
          'oidc',
          'views',
          'consent.html',
        ),
        'utf8',
      );

      // --------------------------------------------------------
      // BUILD REQUESTED SCOPES HTML
      // --------------------------------------------------------

      const scopesHtml =
        requestedScopes
          .map((scope) => {
            const scopeInfo =
              this.getScopeDescription(scope);

            return `
              <li class="scope-item">
                <div class="scope-name">
                  ${this.escapeHtml(scopeInfo.name)}
                </div>
                <div class="scope-description">
                  ${this.escapeHtml(
              scopeInfo.description,
            )}
                </div>
              </li>
            `;
          })
          .join('');

      // --------------------------------------------------------
      // BUILD MISSING SCOPES HTML
      // --------------------------------------------------------

      const missingScopesHtml =
        Array.isArray(missingOIDCScope)
          ? missingOIDCScope
            .map((scope) => {
              const scopeInfo =
                this.getScopeDescription(
                  String(scope),
                );

              return `
                  <li class="scope-item">
                    <div class="scope-name">
                      ${this.escapeHtml(
                scopeInfo.name,
              )}
                    </div>
                    <div class="scope-description">
                      ${this.escapeHtml(
                scopeInfo.description,
              )}
                    </div>
                  </li>
                `;
            })
            .join('')
          : '';

      // --------------------------------------------------------
      // BUILD MISSING CLAIMS HTML
      // --------------------------------------------------------

      const missingClaimsHtml =
        Array.isArray(missingOIDCClaims)
          ? missingOIDCClaims
            .map(
              (claim) =>
                `<li>${this.escapeHtml(
                  String(claim),
                )}</li>`,
            )
            .join('')
          : '';

      // --------------------------------------------------------
      // RENDER CONSENT PAGE
      // --------------------------------------------------------

      const html = template
        .replaceAll(
          '{{UID}}',
          encodeURIComponent(uid),
        )
        .replaceAll(
          '{{clientName}}',
          this.escapeHtml(
            client?.name ?? clientId,
          ),
        )
        .replaceAll(
          '{{CLIENT_ID}}',
          this.escapeHtml(clientId),
        )
        .replaceAll(
          '{{scopes}}',
          scopesHtml,
        )
        .replaceAll(
          '{{MISSING_SCOPES}}',
          missingScopesHtml,
        )
        .replaceAll(
          '{{MISSING_CLAIMS}}',
          missingClaimsHtml,
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
    // UNSUPPORTED INTERACTION
    // ==========================================================

    throw new Error(
      `Unsupported OIDC interaction prompt: ${prompt}`,
    );
  }

  // ============================================================
  // POST /interaction/:uid/login
  // HOSTED LOGIN
  // ============================================================

  @Post(':uid/login')
  async login(
    @Param('uid') uid: string,

    @Body() dto: LoginDto,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    try {
      const details =
        await interaction.details();

      if (
        details.prompt?.name !== 'login'
      ) {
        response
          .status(400)
          .send(
            'This endpoint is not handling a login interaction.',
          );

        return;
      }

      const user =
        await this.authenticationService.authenticate(
          dto.username,
          dto.password,
        );

      await interaction.finished({
        login: {
          accountId: user.id,

          remember: true,

          ts: Math.floor(
            Date.now() / 1000,
          ),
        },
      });
    } catch (error) {
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

      const message =
        error instanceof Error
          ? error.message
          : 'Authentication failed';

      const html = template
        .replaceAll(
          '{{UID}}',
          encodeURIComponent(uid),
        )
        .replaceAll(
          '{{ERROR}}',
          this.escapeHtml(message),
        );

      response
        .status(401)
        .type('html')
        .send(html);
    }
  }

  // ============================================================
  // POST /interaction/:uid/consent
  // HOSTED CONSENT
  // ============================================================

  @Post(':uid/consent')
  async consent(
    @Param('uid') uid: string,

    @Body() dto: ConsentDto,

    @OidcInteraction()
    interaction: InteractionHelper,

    @Res() response: Response,
  ): Promise<void> {
    const details =
      await interaction.details();

    // ==========================================================
    // VALIDATE INTERACTION
    // ==========================================================

    if (
      details.prompt?.name !== 'consent'
    ) {
      response
        .status(400)
        .send(
          'This endpoint is not handling a consent interaction.',
        );

      return;
    }

    // ==========================================================
    // REJECT CONSENT
    // ==========================================================

    if (dto.decision === 'reject') {
      await interaction.finished({
        error: 'access_denied',
        error_description:
          'User denied the consent request.',
      });

      return;
    }

    // ==========================================================
    // VALIDATE DECISION
    // ==========================================================

    if (dto.decision !== 'accept') {
      response
        .status(400)
        .send(
          'Invalid consent decision.',
        );

      return;
    }

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

    // ==========================================================
    // CREATE OR REUSE GRANT
    // ==========================================================

    let grant;

    if (details.grantId) {
      grant =
        await this.oidcService.provider.Grant.find(
          details.grantId,
        );
    }

    if (!grant) {
      grant =
        new this.oidcService.provider.Grant({
          accountId,
          clientId,
        });
    }

    // ==========================================================
    // ADD MISSING OIDC SCOPES
    // ==========================================================

    const missingOIDCScope =
      details.prompt?.details
        ?.missingOIDCScope ?? [];

    if (
      Array.isArray(missingOIDCScope) &&
      missingOIDCScope.length > 0
    ) {
      grant.addOIDCScope(
        missingOIDCScope.join(' '),
      );
    }

    // ==========================================================
    // ADD MISSING OIDC CLAIMS
    // ==========================================================

    const missingOIDCClaims =
      details.prompt?.details
        ?.missingOIDCClaims ?? [];

    if (
      Array.isArray(missingOIDCClaims) &&
      missingOIDCClaims.length > 0
    ) {
      grant.addOIDCClaims(
        missingOIDCClaims,
      );
    }

    // ==========================================================
    // SAVE GRANT
    // ==========================================================

    const grantId =
      await grant.save();

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

  private getScopeDescription(
    scope: string,
  ): ScopeInfo {
    const scopes: Record<
      string,
      ScopeInfo
    > = {
      openid: {
        name: 'OpenID',
        description:
          'Authenticate you and verify your identity.',
      },

      profile: {
        name: 'Profile',
        description:
          'Access your basic profile information, such as your name and profile details.',
      },

      email: {
        name: 'Email',
        description:
          'Access your email address and email verification status.',
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
        description:
          `Access permission for ${scope}.`,
      }
    );
  }

  // ============================================================
  // HTML ESCAPING
  // ============================================================

  private escapeHtml(
    value: string,
  ): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}