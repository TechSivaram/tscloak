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
  decision: 'allow' | 'deny';
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

    // ==========================================================
    // EXTERNAL INTERACTION UI
    // ==========================================================

    if (typeof clientId === 'string' && clientId) {
      const client =
        await this.clientRepository.findByClientId(clientId);

      if (
        client?.interactionMode === InteractionMode.EXTERNAL &&
        client.interactionLoginUrl
      ) {
        const interactionUrl = new URL(
          client.interactionLoginUrl,
        );

        interactionUrl.searchParams.set(
          'interaction_uid',
          uid,
        );

        interactionUrl.searchParams.set(
          'prompt',
          details.prompt?.name ?? '',
        );

        interactionUrl.searchParams.set(
          'client_id',
          clientId,
        );

        response.redirect(interactionUrl.toString());

        return;
      }
    }

    // ==========================================================
    // LOGIN - HOSTED UI
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
    // CONSENT - HOSTED UI
    // ==========================================================

    if (details.prompt?.name === 'consent') {
      if (
        typeof clientId !== 'string' ||
        !clientId
      ) {
        throw new Error(
          'OIDC consent: client_id is missing',
        );
      }

      const client =
        await this.clientRepository.findByClientId(clientId);

      const requestedScopes =
        typeof details.params?.scope === 'string'
          ? details.params.scope
            .split(' ')
            .filter(Boolean)
          : [];

      const scopeHtml = requestedScopes
        .map(
          (scope) => `
            <li>
              <span class="scope-name">
                ${this.escapeHtml(scope)}
              </span>

              <span class="scope-description">
                ${this.escapeHtml(
            this.getScopeDescription(scope),
          )}
              </span>
            </li>
          `,
        )
        .join('');

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

      const html = template
        .replaceAll(
          '{{UID}}',
          encodeURIComponent(uid),
        )
        .replaceAll(
          '{{clientName}}',
          this.escapeHtml(
            client?.name ??
            clientId,
          ),
        )
        .replaceAll(
          '{{scopes}}',
          scopeHtml,
        );

      response
        .status(200)
        .type('html')
        .send(html);

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
  // Handles:
  // - LOGIN
  // - CONSENT
  // ============================================================

  @Post(':uid')
  async submitInteraction(
    @Param('uid') uid: string,

    @Body() body: LoginDto | ConsentDto,

    @OidcInteraction()
    interaction: InteractionHelper,
  ): Promise<void> {
    const details =
      await interaction.details();

    // ==========================================================
    // LOGIN
    // ==========================================================

    if (details.prompt?.name === 'login') {
      const dto = body as LoginDto;

      if (
        !dto.username ||
        !dto.password
      ) {
        await interaction.finished({
          error: 'invalid_request',
          error_description:
            'Username and password are required',
        });

        return;
      }

      const user =
        await this.authenticationService.authenticate(
          dto.username,
          dto.password,
        );

      const loginResult = {
        login: {
          accountId: user.id,
          remember: true,
          ts: Math.floor(
            Date.now() / 1000,
          ),
        },
      };

      await interaction.finished(
        loginResult,
      );

      return;
    }

    // ==========================================================
    // CONSENT
    // ==========================================================

    if (details.prompt?.name === 'consent') {
      const dto = body as ConsentDto;

      // --------------------------------------------------------
      // User denied consent
      // --------------------------------------------------------

      if (dto.decision === 'deny') {
        await interaction.finished({
          error: 'access_denied',
          error_description:
            'The user denied the authorization request.',
        });

        return;
      }

      // --------------------------------------------------------
      // Validate decision
      // --------------------------------------------------------

      if (dto.decision !== 'allow') {
        await interaction.finished({
          error: 'invalid_request',
          error_description:
            'Invalid consent decision.',
        });

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

      // --------------------------------------------------------
      // Load existing grant if available
      // --------------------------------------------------------

      let grant;

      if (details.grantId) {
        grant =
          await this.oidcService.provider.Grant.find(
            details.grantId,
          );
      }

      // --------------------------------------------------------
      // Create new grant if needed
      // --------------------------------------------------------

      if (!grant) {
        grant =
          new this.oidcService.provider.Grant({
            accountId,
            clientId,
          });
      }

      // --------------------------------------------------------
      // Add approved scopes
      // --------------------------------------------------------

      const requestedScopes =
        typeof details.params?.scope === 'string'
          ? details.params.scope
            .split(' ')
            .filter(Boolean)
          : [];

      if (requestedScopes.length > 0) {
        grant.addOIDCScope(
          requestedScopes.join(' '),
        );
      }

      // --------------------------------------------------------
      // Save grant
      // --------------------------------------------------------

      const grantId =
        await grant.save();

      // --------------------------------------------------------
      // Finish consent interaction
      // --------------------------------------------------------

      await interaction.finished({
        consent: {
          grantId,
        },
      });

      return;
    }

    // ==========================================================
    // UNKNOWN INTERACTION
    // ==========================================================

    await interaction.finished({
      error: 'invalid_request',
      error_description:
        'Unsupported interaction.',
    });
  }

  // ============================================================
  // SCOPE DESCRIPTIONS
  // ============================================================

  private getScopeDescription(
    scope: string,
  ): string {
    const descriptions: Record<
      string,
      string
    > = {
      openid:
        'Authenticate using your identity',

      profile:
        'Access your basic profile information',

      email:
        'Access your email address',

      offline_access:
        'Maintain access when you are offline',
    };

    return (
      descriptions[scope] ??
      `Access ${scope}`
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