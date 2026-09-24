import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC prompt=none with an authenticated session (e2e)', () => {
  jest.setTimeout(30_000);

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const username = process.env.E2E_ADMIN_USERNAME ?? 'admin';
  const password = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';
  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function action(html: string, endpoint: 'login' | 'consent') {
    const match = html.match(
      new RegExp(`<form[^>]+action=["']([^"']*\\/${endpoint}[^"']*)["']`, 'i'),
    );
    return match?.[1];
  }

  function authorizationUrl(
    endpoint: string,
    options: { state: string; challenge: string; prompt: string },
  ) {
    const url = new URL(endpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', options.state);
    url.searchParams.set('code_challenge', options.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', options.prompt);
    return `${url.pathname}${url.search}`;
  }

  async function completeInteractiveAuthorization(
    agent: request.SuperAgentTest,
    initial: request.Response,
  ): Promise<URL> {
    let response = initial;
    for (let step = 0; step < 20; step += 1) {
      const location = response.headers.location;
      if (location) {
        const target = new URL(location, baseUrl);
        if (
          target.origin === new URL(redirectUri).origin &&
          target.pathname === new URL(redirectUri).pathname
        ) {
          return target;
        }
        response = await agent
          .get(`${target.pathname}${target.search}`)
          .redirects(0);
        continue;
      }

      const loginAction = action(response.text ?? '', 'login');
      if (loginAction) {
        response = await agent
          .post(new URL(loginAction, baseUrl).pathname + new URL(loginAction, baseUrl).search)
          .type('form')
          .send({ username, password })
          .redirects(0);
        continue;
      }

      const consentAction = action(response.text ?? '', 'consent');
      if (consentAction) {
        response = await agent
          .post(new URL(consentAction, baseUrl).pathname + new URL(consentAction, baseUrl).search)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);
        continue;
      }

      throw new Error(
        `Unexpected authorization response ${response.status}: ${response.text ?? ''}`,
      );
    }
    throw new Error('Authorization interaction exceeded 20 steps');
  }

  it('returns an authorization code for prompt=none after same-client login and consent', async () => {
    const agent = request.agent(baseUrl);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const firstPkce = pkce();
    const firstState = `establish-session-${randomBytes(6).toString('hex')}`;
    const first = await agent
      .get(
        authorizationUrl(discovery.body.authorization_endpoint, {
          state: firstState,
          challenge: firstPkce.challenge,
          prompt: 'login',
        }),
      )
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(first.status);
    const established = await completeInteractiveAuthorization(agent, first);
    expect(established.searchParams.get('code')).toBeTruthy();
    expect(established.searchParams.get('error')).toBeNull();
    expect(established.searchParams.get('state')).toBe(firstState);

    const secondPkce = pkce();
    const secondState = `silent-session-${randomBytes(6).toString('hex')}`;
    const silent = await agent
      .get(
        authorizationUrl(discovery.body.authorization_endpoint, {
          state: secondState,
          challenge: secondPkce.challenge,
          prompt: 'none',
        }),
      )
      .redirects(0);
    expect([301, 302, 303]).toContain(silent.status);
    expect(silent.headers.location).toBeDefined();
    const callback = new URL(silent.headers.location, baseUrl);
    expect(callback.origin).toBe(new URL(redirectUri).origin);
    expect(callback.pathname).toBe(new URL(redirectUri).pathname);
    expect(callback.searchParams.get('error')).toBeNull();
    expect(callback.searchParams.get('code')).toBeTruthy();
    expect(callback.searchParams.get('state')).toBe(secondState);
  });
});
