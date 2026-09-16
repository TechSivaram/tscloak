import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { OidcAdapter } from '../../oidc/adapters/oidc.adapter/oidc.adapter';
import { OidcRepository } from '../../oidc/repositories/oidc.repository';

export interface ValidatedAccessToken {
    sub: string;
    clientId?: string;
    scope?: string;
}

@Injectable()
export class OidcTokenService {
    private readonly accessTokenAdapter: OidcAdapter;

    constructor(
        private readonly oidcRepository: OidcRepository,
    ) {
        this.accessTokenAdapter = new OidcAdapter(
            'AccessToken',
            this.oidcRepository,
        );
    }

    async validate(
        accessToken: string,
    ): Promise<ValidatedAccessToken> {
        if (!accessToken) {
            throw new UnauthorizedException(
                'Access token is required',
            );
        }

        const payload =
            await this.accessTokenAdapter.find(
                accessToken,
            );

        if (!payload) {
            throw new UnauthorizedException(
                'Invalid or expired access token',
            );
        }

        const sub =
            typeof payload.accountId === 'string'
                ? payload.accountId
                : undefined;

        if (!sub) {
            throw new UnauthorizedException(
                'Access token has no account',
            );
        }

        return {
            sub,

            clientId:
                typeof payload.clientId === 'string'
                    ? payload.clientId
                    : undefined,

            scope:
                typeof payload.scope === 'string'
                    ? payload.scope
                    : undefined,
        };
    }
}