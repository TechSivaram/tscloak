import { Injectable } from '@nestjs/common';
import { errors } from 'oidc-provider';

@Injectable()
export class ClientRegistrationPolicyService {
  getPolicies() {
    return {
      'allowed-grant-types': (
        _ctx: unknown,
        properties: Record<string, unknown>,
      ) => {
        const allowed = ['authorization_code', 'refresh_token'];

        const grantTypes = properties.grant_types;

        if (!Array.isArray(grantTypes)) {
          throw new errors.InvalidClientMetadata(
            'grant_types must be an array',
          );
        }

        const invalid = grantTypes.filter(
          (value) => typeof value !== 'string' || !allowed.includes(value),
        );

        if (invalid.length > 0) {
          throw new errors.InvalidClientMetadata(
            `Unsupported grant_types: ${invalid.join(', ')}`,
          );
        }
      },

      'allowed-response-types': (
        _ctx: unknown,
        properties: Record<string, unknown>,
      ) => {
        const allowed = ['code'];

        const responseTypes = properties.response_types;

        if (!Array.isArray(responseTypes)) {
          throw new errors.InvalidClientMetadata(
            'response_types must be an array',
          );
        }

        const invalid = responseTypes.filter(
          (value) => typeof value !== 'string' || !allowed.includes(value),
        );

        if (invalid.length > 0) {
          throw new errors.InvalidClientMetadata(
            `Unsupported response_types: ${invalid.join(', ')}`,
          );
        }
      },

      'allowed-scopes': (
        _ctx: unknown,
        properties: Record<string, unknown>,
      ) => {
        const allowed = [
          'openid',
          'profile',
          'email',
          'offline_access',
          'roles',
        ];

        const scope = properties.scope;

        if (typeof scope !== 'string') {
          throw new errors.InvalidClientMetadata('scope must be a string');
        }

        const requested = scope.split(' ').filter(Boolean);

        const invalid = requested.filter((value) => !allowed.includes(value));

        if (invalid.length > 0) {
          throw new errors.InvalidClientMetadata(
            `Unsupported scopes: ${invalid.join(', ')}`,
          );
        }
      },
    };
  }
}
