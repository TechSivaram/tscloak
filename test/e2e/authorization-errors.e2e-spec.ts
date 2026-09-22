import request from 'supertest';

const BASE_URL = process.env.OIDC_BASE_URL ?? 'http://localhost:3000';

// The built-in TSCloak admin OIDC client used by the existing E2E suite.
const ADMIN_CLIENT_ID = '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

const ADMIN_REDIRECT_URI = 'http://localhost:3000/idp-admin/callback.html';

function authorizationUrl(
  overrides: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams({
    client_id: ADMIN_CLIENT_ID,
    redirect_uri: ADMIN_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    state: 'authorization-error-test',
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  });

  return `/auth?${params.toString()}`;
}

function expectProtocolError(response: request.Response): void {
  // oidc-provider can return a direct HTTP error or redirect an
  // authorization error to a valid redirect_uri, depending on the
  // validation stage.
  expect([400, 302, 303]).toContain(response.status);
}

function expectErrorResponse(response: request.Response): void {
  expectProtocolError(response);

  const location = response.headers.location;

  if (location) {
    expect(decodeURIComponent(location)).toMatch(
      /invalid|unsupported|missing|required|scope|client|redirect|response_type|prompt|pkce|code.?challenge/i,
    );
  } else {
    expect(response.text).toMatch(
      /invalid|unsupported|missing|required|scope|client|redirect|response_type|prompt|pkce|code.?challenge/i,
    );
  }
}

describe('OIDC Authorization Errors (e2e)', () => {
  describe('required authorization parameters', () => {
    it('rejects an unknown client_id', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          client_id: 'unknown-client-id',
        }),
      );

      expectProtocolError(response);
      expect(response.headers.location ?? response.text).toMatch(
        /invalid|client/i,
      );
    });

    it('rejects a missing client_id', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          client_id: undefined,
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects a missing redirect_uri', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          redirect_uri: undefined,
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects an unregistered redirect_uri', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          redirect_uri: 'http://localhost:3000/not-registered.html',
        }),
      );

      // A redirect URI mismatch must not result in an authorization-code
      // response being sent to the unregistered URI.
      expect([400, 401]).toContain(response.status);
      expect(response.headers.location ?? '').not.toContain(
        'not-registered.html',
      );
    });

    it('rejects a redirect_uri with an unregistered query component', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          redirect_uri: `${ADMIN_REDIRECT_URI}?unexpected=1`,
        }),
      );

      expect([400, 401]).toContain(response.status);
      expect(response.headers.location ?? '').not.toContain('unexpected=1');
    });

    it('rejects a missing response_type', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          response_type: undefined,
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects an unsupported response_type', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          response_type: 'token',
        }),
      );

      expectProtocolError(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(
          /unsupported|response_type|invalid/i,
        );
      } else {
        expect(response.text).toMatch(/unsupported|response_type|invalid/i);
      }
    });

    it('rejects a missing scope', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          scope: undefined,
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects an authorization request without the openid scope', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          scope: 'profile email',
        }),
      );

      expectProtocolError(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(/openid|scope|invalid/i);
      } else {
        expect(response.text).toMatch(/openid|scope|invalid/i);
      }
    });

    it('rejects an unsupported scope', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          scope: 'openid profile email unsupported_scope',
        }),
      );

      expectErrorResponse(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(
          /unsupported_scope|invalid|scope/i,
        );
      } else {
        expect(response.text).toMatch(/unsupported_scope|invalid|scope/i);
      }
    });
  });

  describe('authorization request validation', () => {
    it('rejects an invalid prompt value', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          prompt: 'invalid_prompt',
        }),
      );

      expectErrorResponse(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(/prompt|invalid/i);
      } else {
        expect(response.text).toMatch(/prompt|invalid/i);
      }
    });

    it('rejects an empty prompt value', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          prompt: '',
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects an invalid response_type combination', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          response_type: 'code token',
        }),
      );

      expectErrorResponse(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(
          /response_type|unsupported|invalid/i,
        );
      } else {
        expect(response.text).toMatch(/response_type|unsupported|invalid/i);
      }
    });

    it('rejects an invalid client_id together with an invalid redirect_uri', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          client_id: 'unknown-client-id',
          redirect_uri: 'http://localhost:3000/not-registered.html',
        }),
      );

      expectProtocolError(response);

      // The provider must not redirect to an attacker-controlled URI when
      // it cannot establish a valid client/redirect URI pair.
      expect(response.headers.location ?? '').not.toContain(
        'not-registered.html',
      );
    });
  });

  describe('PKCE validation', () => {
    it('rejects an invalid PKCE code_challenge', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          code_challenge: 'not-a-valid-code-challenge',
          code_challenge_method: 'S256',
        }),
      );

      expectProtocolError(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(
          /code.?challenge|pkce|invalid/i,
        );
      } else {
        expect(response.text).toMatch(/code.?challenge|pkce|invalid/i);
      }
    });

    it('rejects an unsupported PKCE code_challenge_method', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          code_challenge: 'abcdefghijklmnopqrstuvwxyz0123456789-_',
          code_challenge_method: 'plain',
        }),
      );

      expectErrorResponse(response);

      const location = response.headers.location;

      if (location) {
        expect(decodeURIComponent(location)).toMatch(
          /code.?challenge|pkce|method|unsupported|invalid/i,
        );
      } else {
        expect(response.text).toMatch(
          /code.?challenge|pkce|method|unsupported|invalid/i,
        );
      }
    });

    it('rejects an empty PKCE code_challenge_method', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          code_challenge: 'abcdefghijklmnopqrstuvwxyz0123456789-_',
          code_challenge_method: '',
        }),
      );

      expectErrorResponse(response);
    });

    it('rejects a malformed S256 PKCE code_challenge', async () => {
      const response = await request(BASE_URL).get(
        authorizationUrl({
          code_challenge: 'short',
          code_challenge_method: 'S256',
        }),
      );

      expectErrorResponse(response);
    });
  });

  describe('prompt=none', () => {
    it('does not silently authenticate an unauthenticated request', async () => {
      // TSCloak requires PKCE for authorization requests. Include a valid
      // S256 challenge so this test reaches prompt=none interaction handling
      // instead of being rejected earlier by the PKCE policy.
      const response = await request(BASE_URL).get(
        authorizationUrl({
          prompt: 'none',
          code_challenge:
            'abcdefghijklmnopqrstuvwxyz0123456789-_abcdefghijklmnopqrstuvwxyz',
          code_challenge_method: 'S256',
        }),
      );

      expectProtocolError(response);

      const location = response.headers.location;

      if (location) {
        const decoded = decodeURIComponent(location);

        expect(decoded).toMatch(
          /login_required|interaction_required|consent_required|access_denied/i,
        );
      } else {
        expect(response.text).toMatch(
          /login_required|interaction_required|consent_required|access_denied/i,
        );
      }
    });
  });
});
