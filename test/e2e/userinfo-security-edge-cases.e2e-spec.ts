import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC UserInfo Security Edge Cases (e2e)', () => {
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
      scope: 'openid profile email roles',
      prompt: 'consent',
      state: `userinfo-security-${randomBytes(8).toString('hex')}`,
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

  async function issueAccessToken() {
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

    return token.body.access_token as string;
  }

  it('rejects UserInfo requests without an access token', async () => {
    const response = await request(baseUrl)
      .get('/me')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
  });

  it('rejects an unknown bearer access token', async () => {
    const response = await request(baseUrl)
      .get('/me')
      .set('Authorization', `Bearer ${randomBytes(48).toString('base64url')}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
  });

  it('rejects a malformed bearer credential', async () => {
    const response = await request(baseUrl)
      .get('/me')
      .set('Authorization', 'Bearer not-a-valid-access-token')
      .set('Accept', 'application/json');

    expect(response.status).toBe(401);
  });

  it('does not accept Basic authentication as a substitute for a bearer token', async () => {
    const response = await request(baseUrl)
      .get('/me')
      .set(
        'Authorization',
        `Basic ${Buffer.from('access-token:').toString('base64')}`,
      )
      .set('Accept', 'application/json');

    expect([400, 401]).toContain(response.status);
  });

  it('accepts a valid access token through the Authorization header', async () => {
    const accessToken = await issueAccessToken();

    const response = await request(baseUrl)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(response.body.sub).toBeTruthy();
  });

  it('returns claims corresponding to the granted UserInfo scopes', async () => {
    const accessToken = await issueAccessToken();

    const response = await request(baseUrl)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.sub).toBeTruthy();
    expect(response.body.name).toBeTruthy();
    expect(response.body.preferred_username).toBeTruthy();
    expect(response.body.email).toBeTruthy();
    expect(response.body.email_verified).toBe(true);
    expect(Array.isArray(response.body.roles)).toBe(true);
  });

  it('accepts the valid access token on the UserInfo POST method', async () => {
    const accessToken = await issueAccessToken();

    const response = await request(baseUrl)
      .post('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.sub).toBeTruthy();
  });

  it('rejects an access token after it has been revoked', async () => {
    const accessToken = await issueAccessToken();

    const before = await request(baseUrl)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(before.status).toBe(200);

    const revoked = await request(baseUrl)
      .post('/token/revocation')
      .type('form')
      .send({
        token: accessToken,
        token_type_hint: 'access_token',
        client_id: clientId,
      });

    expect([200, 204]).toContain(revoked.status);

    const after = await request(baseUrl)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Accept', 'application/json');

    expect(after.status).toBe(401);
  });
});
