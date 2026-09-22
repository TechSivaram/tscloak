import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

const baseUrl =
  process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

const defaultClientId =
  process.env.E2E_CLIENT_ID ??
  '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

// `admin` is the username. Keep the configured IDP admin callback URI.
const defaultRedirectUri =
  process.env.E2E_REDIRECT_URI ??
  `${new URL(baseUrl).origin}/idp-admin/callback.html`;

type Discovery = {
  authorization_endpoint: string;
};

type AuthorizationContext = {
  agent: request.Agent;
  response: request.Response;
};

function createPkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return { verifier, challenge };
}

async function getDiscovery(): Promise<Discovery> {
  const response = await request(baseUrl)
    .get('/.well-known/openid-configuration')
    .expect(200);

  expect(typeof response.body.authorization_endpoint).toBe('string');

  return response.body;
}

async function beginAuthorization(
  authorizationEndpoint: string,
  extraParams: Record<string, string> = {},
): Promise<AuthorizationContext> {
  const agent = request.agent(baseUrl);
  const { challenge } = createPkce();

  const query = new URLSearchParams({
    client_id: defaultClientId,
    redirect_uri: defaultRedirectUri,
    response_type: 'code',
    scope: 'openid profile email offline_access roles',
    prompt: 'consent',
    state: `claims-state-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    nonce: `claims-nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...extraParams,
  });

  const endpoint = new URL(authorizationEndpoint);

  const response = await agent
    .get(`${endpoint.pathname}?${query.toString()}`)
    .ok(() => true);

  return { agent, response };
}

function expectHostedInteraction(response: request.Response) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const interaction = new URL(location, baseUrl);

  expect(interaction.origin).toBe(new URL(baseUrl).origin);
  expect(interaction.pathname).toMatch(/^\/interaction\/[^/]+$/);
}

async function completeHostedInteraction(
  context: AuthorizationContext,
): Promise<request.Response> {
  let response = context.response;
  let guard = 0;

  while (guard++ < 15) {
    const location = response.headers.location;

    if (location) {
      const url = new URL(location, baseUrl);
      const configuredRedirect = new URL(defaultRedirectUri);

      // The provider may return an intermediate /auth/:id redirect after
      // the interaction is completed. Follow it until the registered
      // callback URI is produced.
      if (
        url.origin === configuredRedirect.origin &&
        url.pathname === configuredRedirect.pathname
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

    const loginMatch = body.match(
      /<form[^>]+action=["']([^"']*\/login[^"']*)["']/i,
    );

    if (loginMatch) {
      const action = new URL(loginMatch[1], baseUrl);

      response = await context.agent
        .post(`${action.pathname}${action.search}`)
        .type('form')
        .send({
          username: process.env.E2E_USERNAME ?? 'admin',
          password: process.env.E2E_PASSWORD ?? 'Password123!',
        })
        .ok(() => true);

      if (response.status >= 400) {
        throw new Error(
          `Login interaction failed with ${response.status}: ${
            response.text ?? ''
          }`,
        );
      }

      continue;
    }

    const consentMatch = body.match(
      /<form[^>]+action=["']([^"']*\/consent[^"']*)["']/i,
    );

    if (consentMatch) {
      const action = new URL(consentMatch[1], baseUrl);

      response = await context.agent
        .post(`${action.pathname}${action.search}`)
        .type('form')
        .send({ decision: 'accept' })
        .ok(() => true);

      if (response.status >= 400) {
        throw new Error(
          `Consent interaction failed with ${response.status}: ${
            response.text ?? ''
          }`,
        );
      }

      continue;
    }

    return response;
  }

  throw new Error('Authorization flow did not complete within 15 steps');
}

function expectSuccessfulAuthorization(response: request.Response) {
  expect([302, 303]).toContain(response.status);

  const location = response.headers.location;
  expect(location).toBeTruthy();

  const callback = new URL(location, baseUrl);
  const configuredRedirect = new URL(defaultRedirectUri);

  expect(callback.origin).toBe(configuredRedirect.origin);
  expect(callback.pathname).toBe(configuredRedirect.pathname);
  expect(callback.searchParams.get('error')).toBeNull();
  expect(callback.searchParams.get('code')).toBeTruthy();
  expect(callback.searchParams.get('state')).toBeTruthy();
}

describe('OIDC authorization request claims (e2e)', () => {
  let discovery: Discovery;

  beforeAll(async () => {
    discovery = await getDiscovery();
  });

  it('accepts a valid claims parameter and starts hosted interaction', async () => {
    const claims = JSON.stringify({
      id_token: {
        email: { essential: true },
      },
      userinfo: {
        name: { essential: true },
      },
    });

    const context = await beginAuthorization(discovery.authorization_endpoint, {
      claims,
    });

    expectHostedInteraction(context.response);
  });

  it('accepts an empty claims object and starts hosted interaction', async () => {
    const context = await beginAuthorization(discovery.authorization_endpoint, {
      claims: JSON.stringify({}),
    });

    expectHostedInteraction(context.response);
  });

  it('does not prevent the hosted interaction for malformed claims JSON', async () => {
    const context = await beginAuthorization(discovery.authorization_endpoint, {
      claims: '{"id_token":',
    });

    expectHostedInteraction(context.response);
  });

  it('does not prevent the hosted interaction for a non-object claims value', async () => {
    const context = await beginAuthorization(discovery.authorization_endpoint, {
      claims: JSON.stringify('not-an-object'),
    });

    expectHostedInteraction(context.response);
  });

  it('continues normal authorization when the claims parameter is omitted', async () => {
    const context = await beginAuthorization(discovery.authorization_endpoint);

    const response = await completeHostedInteraction(context);

    expectSuccessfulAuthorization(response);
  });
});
