import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

const baseUrl =
  process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

const clientId =
  process.env.E2E_CLIENT_ID ??
  '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

const redirectUri =
  process.env.E2E_REDIRECT_URI ??
  `${new URL(baseUrl).origin}/idp-admin/callback.html`;

const username = process.env.E2E_USERNAME ?? 'admin';
const password = process.env.E2E_PASSWORD ?? 'Password123!';

type Discovery = {
  authorization_endpoint: string;
  token_endpoint: string;
};

type AuthorizationContext = {
  agent: request.Agent;
  response: request.Response;
  verifier: string;
  state: string;
};

async function getDiscovery(): Promise<Discovery> {
  const response = await request(baseUrl)
    .get('/.well-known/openid-configuration')
    .expect(200);

  expect(typeof response.body.authorization_endpoint).toBe('string');
  expect(typeof response.body.token_endpoint).toBe('string');

  return response.body;
}

function createPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return { verifier, challenge };
}

async function beginAuthorization(
  authorizationEndpoint: string,
  extra: Record<string, string> = {},
): Promise<AuthorizationContext> {
  const agent = request.agent(baseUrl);
  const { verifier, challenge } = createPkce();
  const state = `pkce-state-${randomBytes(12).toString('base64url')}`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access roles',
    state,
    nonce: `pkce-nonce-${randomBytes(12).toString('base64url')}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extra,
  });

  const endpoint = new URL(authorizationEndpoint);

  const response = await agent
    .get(`${endpoint.pathname}?${params.toString()}`)
    .ok(() => true);

  return { agent, response, verifier, state };
}

function expectHostedInteraction(response: request.Response) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const interaction = new URL(location, baseUrl);

  expect(interaction.origin).toBe(new URL(baseUrl).origin);
  expect(interaction.pathname).toMatch(/^\/interaction\/[^/]+$/);
}

async function completeInteraction(
  context: AuthorizationContext,
): Promise<request.Response> {
  let response = context.response;

  for (let step = 0; step < 15; step++) {
    const location = response.headers.location;

    if (location) {
      const url = new URL(location, baseUrl);
      const callback = new URL(redirectUri);

      if (
        url.origin === callback.origin &&
        url.pathname === callback.pathname
      ) {
        return response;
      }

      response = await context.agent
        .get(`${url.pathname}${url.search}`)
        .ok(() => true);

      if (response.status >= 400) {
        throw new Error(
          `Authorization continuation failed with ${response.status}: ${
            response.text ?? ''
          }`,
        );
      }

      continue;
    }

    const body = response.text ?? '';

    const login = body.match(/<form[^>]+action=["']([^"']*\/login[^"']*)["']/i);

    if (login) {
      const action = new URL(login[1], baseUrl);

      response = await context.agent
        .post(`${action.pathname}${action.search}`)
        .type('form')
        .send({ username, password })
        .ok(() => true);

      if (response.status >= 400) {
        throw new Error(
          `Login failed with ${response.status}: ${response.text ?? ''}`,
        );
      }

      continue;
    }

    const consent = body.match(
      /<form[^>]+action=["']([^"']*\/consent[^"']*)["']/i,
    );

    if (consent) {
      const action = new URL(consent[1], baseUrl);

      response = await context.agent
        .post(`${action.pathname}${action.search}`)
        .type('form')
        .send({ decision: 'accept' })
        .ok(() => true);

      if (response.status >= 400) {
        throw new Error(
          `Consent failed with ${response.status}: ${response.text ?? ''}`,
        );
      }

      continue;
    }

    return response;
  }

  throw new Error('Authorization interaction exceeded 15 steps');
}

function getAuthorizationCode(response: request.Response): string {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const callback = new URL(location, baseUrl);
  const expected = new URL(redirectUri);

  expect(callback.origin).toBe(expected.origin);
  expect(callback.pathname).toBe(expected.pathname);
  expect(callback.searchParams.get('error')).toBeNull();

  const code = callback.searchParams.get('code');
  expect(code).toBeTruthy();

  return code!;
}

function expectAuthorizationError(
  response: request.Response,
  error = 'invalid_request',
) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const callback = new URL(location, baseUrl);
  const expected = new URL(redirectUri);

  expect(callback.origin).toBe(expected.origin);
  expect(callback.pathname).toBe(expected.pathname);
  expect(callback.searchParams.get('error')).toBe(error);
}

async function authorize(
  authorizationEndpoint: string,
  extra: Record<string, string> = {},
) {
  const context = await beginAuthorization(authorizationEndpoint, extra);
  const response = await completeInteraction(context);

  return {
    ...context,
    response,
    code: getAuthorizationCode(response),
  };
}

async function exchangeCode(
  tokenEndpoint: string,
  code: string,
  verifier: string | undefined,
  extra: Record<string, string> = {},
) {
  const form: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    ...extra,
  };

  if (verifier !== undefined) {
    form.code_verifier = verifier;
  }

  return request(baseUrl)
    .post(new URL(tokenEndpoint).pathname)
    .type('form')
    .send(form)
    .ok(() => true);
}

describe('OIDC PKCE security (e2e)', () => {
  let oidc: Discovery;

  beforeAll(async () => {
    oidc = await getDiscovery();
  });

  it('rejects authorization without code_challenge after interaction', async () => {
    const context = await beginAuthorization(oidc.authorization_endpoint, {
      code_challenge: '',
      code_challenge_method: 'S256',
    });

    const response = await completeInteraction(context);

    expectAuthorizationError(response);
  });

  it('rejects authorization without code_challenge_method after interaction', async () => {
    const { challenge } = createPkce();

    const context = await beginAuthorization(oidc.authorization_endpoint, {
      code_challenge: challenge,
      code_challenge_method: '',
    });

    const response = await completeInteraction(context);

    expectAuthorizationError(response);
  });

  it('rejects authorization with code_challenge_method=plain after interaction', async () => {
    const { verifier } = createPkce();

    const context = await beginAuthorization(oidc.authorization_endpoint, {
      code_challenge: verifier,
      code_challenge_method: 'plain',
    });

    const response = await completeInteraction(context);

    expectAuthorizationError(response);
  });

  it('rejects authorization with an invalid S256 code_challenge after interaction', async () => {
    const context = await beginAuthorization(oidc.authorization_endpoint, {
      code_challenge: 'not-a-valid-s256-challenge',
      code_challenge_method: 'S256',
    });

    const response = await completeInteraction(context);

    expectAuthorizationError(response);
  });

  it('accepts a valid PKCE authorization request and returns a code', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    expect(context.code).toBeTruthy();
    expect(context.state).toBeTruthy();
  });

  it('rejects a token request with an incorrect code_verifier', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    const wrongVerifier = randomBytes(32).toString('base64url');

    const response = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      wrongVerifier,
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toBeTruthy();
  });

  it('rejects a token request without code_verifier', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    const response = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      undefined,
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toBeTruthy();
  });

  it('accepts a token request with the correct code_verifier', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    const response = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      context.verifier,
    );

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeTruthy();
  });

  it('rejects reuse of an authorization code', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    const first = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      context.verifier,
    );

    expect(first.status).toBe(200);

    const second = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      context.verifier,
    );

    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(second.body.error).toBeTruthy();
  });

  it('rejects an authorization code exchanged with a different client id', async () => {
    const context = await authorize(oidc.authorization_endpoint);

    const response = await exchangeCode(
      oidc.token_endpoint,
      context.code,
      context.verifier,
      {
        client_id: 'different-client-id',
      },
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toBeTruthy();
  });
});
