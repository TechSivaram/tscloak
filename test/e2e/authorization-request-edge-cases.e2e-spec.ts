import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Authorization Request Edge Cases (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  function authorizationPath(
    overrides: Record<string, string | undefined> = {},
  ) {
    const { challenge } = pkce();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: `edge-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) {
        params.set(key, value);
      }
    }

    return `/auth?${params.toString()}`;
  }

  async function getAuthorization(overrides = {}) {
    const agent = request.agent(baseUrl);
    const response = await agent.get(authorizationPath(overrides)).redirects(0);

    return { agent, response };
  }

  async function expectLoginInteraction(
    agent: ReturnType<typeof request.agent>,
    response: request.Response,
  ) {
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    const location = new URL(response.headers.location, baseUrl);
    expect(location.pathname).toMatch(/^\/interaction\/[^/]+$/);

    const interaction = await agent
      .get(`${location.pathname}${location.search}`)
      .redirects(0);

    expect(interaction.status).toBe(200);
    expect(interaction.headers['content-type']).toMatch(/html/);
    expect(interaction.text).toContain('<form');
    expect(interaction.text).toContain('password');

    return { location, interaction };
  }

  it('accepts login_hint and routes the request to the login interaction', async () => {
    const { agent, response } = await getAuthorization({
      login_hint: 'admin',
    });

    await expectLoginInteraction(agent, response);
  });

  it('accepts max_age=0 and requires a login interaction when no session exists', async () => {
    const { agent, response } = await getAuthorization({
      max_age: '0',
    });

    await expectLoginInteraction(agent, response);
  });

  it('accepts prompt=login and requires a fresh login interaction', async () => {
    const { agent, response } = await getAuthorization({
      prompt: 'login',
    });

    await expectLoginInteraction(agent, response);
  });

  it('accepts prompt=consent and routes to an OIDC interaction', async () => {
    const { agent, response } = await getAuthorization({
      prompt: 'consent',
    });

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    const location = new URL(response.headers.location, baseUrl);
    expect(location.pathname).toMatch(/^\/interaction\/[^/]+$/);

    const interaction = await agent
      .get(`${location.pathname}${location.search}`)
      .redirects(0);

    expect(interaction.status).toBe(200);
    expect(interaction.headers['content-type']).toMatch(/html/);
  });

  it('accepts acr_values as an authorization request parameter', async () => {
    const { agent, response } = await getAuthorization({
      acr_values: 'urn:tscloak:loa:1',
    });

    await expectLoginInteraction(agent, response);
  });

  it('rejects an unsupported response_mode instead of silently accepting it', async () => {
    const { response } = await getAuthorization({
      response_mode: 'not-a-supported-response-mode',
    });

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects a duplicate client_id parameter', async () => {
    const { challenge } = pkce();
    const params = new URLSearchParams();

    params.append('client_id', clientId);
    params.append('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.set('response_type', 'code');
    params.set('scope', 'openid');
    params.set('state', `duplicate-${randomBytes(8).toString('hex')}`);
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');

    const response = await request(baseUrl)
      .get(`/auth?${params.toString()}`)
      .redirects(0);

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects a duplicate redirect_uri parameter', async () => {
    const { challenge } = pkce();
    const params = new URLSearchParams();

    params.set('client_id', clientId);
    params.append('redirect_uri', redirectUri);
    params.append('redirect_uri', redirectUri);
    params.set('response_type', 'code');
    params.set('scope', 'openid');
    params.set('state', `duplicate-${randomBytes(8).toString('hex')}`);
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');

    const response = await request(baseUrl)
      .get(`/auth?${params.toString()}`)
      .redirects(0);

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects a duplicate response_type parameter', async () => {
    const { challenge } = pkce();
    const params = new URLSearchParams();

    params.set('client_id', clientId);
    params.set('redirect_uri', redirectUri);
    params.append('response_type', 'code');
    params.append('response_type', 'code');
    params.set('scope', 'openid');
    params.set('state', `duplicate-${randomBytes(8).toString('hex')}`);
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');

    const response = await request(baseUrl)
      .get(`/auth?${params.toString()}`)
      .redirects(0);

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects prompt=none combined with prompt=login', async () => {
    const { response } = await getAuthorization({
      prompt: 'none login',
    });

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects prompt=none combined with prompt=consent', async () => {
    const { response } = await getAuthorization({
      prompt: 'none consent',
    });

    expect([400, 403, 303]).toContain(response.status);
  });

  it('rejects a negative max_age value', async () => {
    const { response } = await getAuthorization({
      max_age: '-1',
    });

    expect([400, 403, 303]).toContain(response.status);
  });
});
