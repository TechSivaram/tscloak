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
};

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return { verifier, challenge };
}

async function discovery(): Promise<Discovery> {
  const response = await request(baseUrl)
    .get('/.well-known/openid-configuration')
    .expect(200);

  expect(response.body.authorization_endpoint).toBeTruthy();

  return response.body;
}

async function authorization(
  endpoint: string,
  extra: Record<string, string> = {},
) {
  const agent = request.agent(baseUrl);
  const { verifier, challenge } = pkce();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access roles',
    state: `parameter-state-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    nonce: `parameter-nonce-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extra,
  });

  const url = new URL(endpoint);

  const response = await agent
    .get(`${url.pathname}?${params.toString()}`)
    .ok(() => true);

  return { agent, response, verifier };
}

function expectInteraction(response: request.Response) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const url = new URL(location, baseUrl);

  expect(url.origin).toBe(new URL(baseUrl).origin);
  expect(url.pathname).toMatch(/^\/interaction\/[^/]+$/);
}

async function finishInteraction(
  agent: request.Agent,
  initial: request.Response,
) {
  let response = initial;

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

      response = await agent.get(`${url.pathname}${url.search}`).ok(() => true);

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

      response = await agent
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

      response = await agent
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

function expectAuthorizationResponse(response: request.Response) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const callback = new URL(location, baseUrl);
  const expected = new URL(redirectUri);

  expect(callback.origin).toBe(expected.origin);
  expect(callback.pathname).toBe(expected.pathname);
  expect(callback.searchParams.get('error')).toBeNull();
  expect(callback.searchParams.get('code')).toBeTruthy();
  expect(callback.searchParams.get('state')).toBeTruthy();
}

describe('OIDC authorization parameters (e2e)', () => {
  let oidc: Discovery;

  beforeAll(async () => {
    oidc = await discovery();
  });

  it('accepts a normal authorization request', async () => {
    const context = await authorization(oidc.authorization_endpoint);

    expectInteraction(context.response);

    const response = await finishInteraction(context.agent, context.response);

    expectAuthorizationResponse(response);
  });

  it('accepts prompt=consent', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      prompt: 'consent',
    });

    expectInteraction(context.response);
  });

  it('accepts prompt=login', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      prompt: 'login',
    });

    expectInteraction(context.response);
  });

  it('accepts a login_hint parameter', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      login_hint: username,
    });

    expectInteraction(context.response);
  });

  it('accepts an acr_values parameter', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      acr_values: 'urn:mace:incommon:iap:silver',
    });

    expectInteraction(context.response);
  });

  it('accepts a ui_locales parameter', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      ui_locales: 'en',
    });

    expectInteraction(context.response);
  });

  it('accepts max_age=0 and starts interaction', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      max_age: '0',
    });

    expectInteraction(context.response);
  });

  it('accepts a state value containing URL-safe characters', async () => {
    const state = `state-${randomBytes(16).toString('base64url')}`;

    const context = await authorization(oidc.authorization_endpoint, {
      state,
    });

    expectInteraction(context.response);
  });

  it('accepts a nonce value containing URL-safe characters', async () => {
    const context = await authorization(oidc.authorization_endpoint, {
      nonce: randomBytes(24).toString('base64url'),
    });

    expectInteraction(context.response);
  });
});
