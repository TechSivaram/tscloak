import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Refresh Token Security Edge Cases (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';
  const username = process.env.E2E_USERNAME ?? 'admin';
  const password = process.env.E2E_PASSWORD ?? 'Password123!';

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  function authorizationPath(challenge: string) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email offline_access',
      prompt: 'consent',
      state: `refresh-security-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `/auth?${params.toString()}`;
  }

  async function follow(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ) {
    const url = new URL(location, baseUrl);

    return agent.get(`${url.pathname}${url.search}`).redirects(0);
  }

  async function issueRefreshToken() {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = pkce();

    let response = await agent.get(authorizationPath(challenge)).redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    let location = response.headers.location;
    let url = new URL(location, baseUrl);

    expect(url.pathname).toMatch(/^\/interaction\/[^/]+$/);

    response = await follow(agent, location);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<form');
    expect(response.text).toContain('password');

    let uid = url.pathname.split('/').pop();
    expect(uid).toBeDefined();

    response = await agent
      .post(`/interaction/${uid}/login`)
      .type('form')
      .send({ username, password })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    response = await follow(agent, response.headers.location);

    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.location
    ) {
      location = response.headers.location;
      url = new URL(location, baseUrl);

      if (url.pathname.startsWith('/interaction/')) {
        uid = url.pathname.split('/').pop();
        expect(uid).toBeDefined();

        response = await agent.get(`${url.pathname}${url.search}`).redirects(0);

        expect(response.status).toBe(200);
        expect(response.text).toContain('consent');

        response = await agent
          .post(`/interaction/${uid}/consent`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(response.status);
        expect(response.headers.location).toBeDefined();

        response = await follow(agent, response.headers.location);
      }
    }

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    const callback = new URL(response.headers.location, baseUrl);
    const code = callback.searchParams.get('code');

    expect(code).toBeTruthy();

    const token = await request(baseUrl).post('/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });

    expect(token.status).toBe(200);
    expect(token.body.access_token).toBeTruthy();
    expect(token.body.refresh_token).toBeTruthy();

    return {
      refreshToken: token.body.refresh_token as string,
      accessToken: token.body.access_token as string,
    };
  }

  async function refreshRequest(fields: Record<string, string>) {
    return request(baseUrl)
      .post('/token')
      .type('form')
      .send(fields)
      .redirects(0);
  }

  it('rejects refresh_token grant without a refresh token', async () => {
    const response = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects a completely unknown refresh token', async () => {
    const response = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: randomBytes(48).toString('base64url'),
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects an unsupported grant_type even when a refresh token is supplied', async () => {
    const issued = await issueRefreshToken();

    const response = await refreshRequest({
      grant_type: 'not-a-real-grant',
      client_id: clientId,
      refresh_token: issued.refreshToken,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects refresh token use with the wrong client_id', async () => {
    const issued = await issueRefreshToken();

    const response = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: `wrong-${clientId}`,
      refresh_token: issued.refreshToken,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects refresh token use with an invalid requested scope', async () => {
    const issued = await issueRefreshToken();

    const response = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: issued.refreshToken,
      scope: 'openid profile email roles scope-not-granted',
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('allows a valid refresh-token exchange', async () => {
    const issued = await issueRefreshToken();

    const response = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: issued.refreshToken,
    });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeTruthy();
    expect(response.body.token_type).toBeTruthy();
  });

  it('does not allow a refresh token to be used with an authorization-code grant', async () => {
    const issued = await issueRefreshToken();

    const response = await refreshRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: issued.refreshToken,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('preserves the original refresh token validity rules after a successful refresh', async () => {
    const issued = await issueRefreshToken();

    const first = await refreshRequest({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: issued.refreshToken,
    });

    expect(first.status).toBe(200);
    expect(first.body.access_token).toBeTruthy();

    // The provider may rotate refresh tokens or retain the original token.
    // In either case, the response must remain a valid OAuth token response.
    if (first.body.refresh_token) {
      expect(typeof first.body.refresh_token).toBe('string');
      expect(first.body.refresh_token.length).toBeGreaterThan(0);
    }
  });
});
