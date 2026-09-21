import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC UserInfo endpoint (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const username = process.env.E2E_ADMIN_USERNAME ?? 'admin';
  const password = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  function createPkce() {
    const codeVerifier = randomBytes(32).toString('base64url');

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  async function followRedirects(
    agent: request.SuperAgentTest,
    location: string,
  ) {
    let url = new URL(location, baseUrl);

    for (let i = 0; i < 10; i++) {
      const response = await agent
        .get(`${url.pathname}${url.search}`)
        .redirects(0);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, url };
      }

      expect(response.headers.location).toBeDefined();
      url = new URL(response.headers.location, baseUrl);
    }

    throw new Error('Too many redirects while following OIDC flow');
  }

  async function obtainAccessToken(scope: string) {
    const agent = request.agent(baseUrl);

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const {
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      userinfo_endpoint: userinfoEndpoint,
    } = discovery.body;

    expect(authorizationEndpoint).toBeDefined();
    expect(tokenEndpoint).toBeDefined();
    expect(userinfoEndpoint).toBeDefined();

    const { codeVerifier, codeChallenge } = createPkce();

    const authorizationUrl = new URL(authorizationEndpoint);

    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', scope);
    authorizationUrl.searchParams.set('state', `e2e-${Date.now()}`);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const authorization = await agent
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(authorization.status);
    expect(authorization.headers.location).toBeDefined();

    let current = new URL(authorization.headers.location, baseUrl);
    let interactionUid: string | undefined;

    for (let i = 0; i < 10; i++) {
      if (current.pathname.startsWith('/interaction/')) {
        interactionUid = current.pathname.split('/').filter(Boolean).pop();
        break;
      }

      const response = await agent
        .get(`${current.pathname}${current.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.location).toBeDefined();

      current = new URL(response.headers.location, baseUrl);
    }

    expect(interactionUid).toBeDefined();

    await agent.get(`/interaction/${interactionUid}`).expect(200);

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({ username, password })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let consentUid = interactionUid;

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();

      const result = await followRedirects(agent, login.headers.location);

      if (result.url.pathname.startsWith('/interaction/')) {
        consentUid = result.url.pathname.split('/').filter(Boolean).pop();
      }
    }

    expect(consentUid).toBeDefined();

    await agent.get(`/interaction/${consentUid}`).expect(200);

    const consent = await agent
      .post(`/interaction/${consentUid}/consent`)
      .send({ decision: 'accept' })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);

    if ([301, 302, 303, 307, 308].includes(consent.status)) {
      expect(consent.headers.location).toBeDefined();
    }

    const callbackLocation = consent.headers.location;
    expect(callbackLocation).toBeDefined();

    const callbackResult = await followRedirects(agent, callbackLocation);

    const callback = callbackResult.url;

    expect(callback.pathname).toBe('/idp-admin/callback.html');

    const error = callback.searchParams.get('error');

    if (error) {
      throw new Error(
        `OIDC authorization failed: ${error}: ${
          callback.searchParams.get('error_description') ?? ''
        }`,
      );
    }

    const code = callback.searchParams.get('code');
    expect(code).toBeDefined();

    const tokenUrl = new URL(tokenEndpoint);

    const token = await agent
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeDefined();
    expect(token.body.token_type).toBe('Bearer');

    return {
      agent,
      accessToken: token.body.access_token as string,
      userinfoEndpoint: userinfoEndpoint as string,
    };
  }

  it('returns UserInfo claims for a valid access token', async () => {
    const { agent, accessToken, userinfoEndpoint } = await obtainAccessToken(
      'openid profile email',
    );

    const endpoint = new URL(userinfoEndpoint);

    const response = await agent
      .get(`${endpoint.pathname}${endpoint.search}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      sub: expect.any(String),
      name: expect.any(String),
      preferred_username: expect.any(String),
      email: expect.any(String),
      email_verified: true,
    });
  });

  it('returns the authenticated subject consistently', async () => {
    const { agent, accessToken, userinfoEndpoint } = await obtainAccessToken(
      'openid profile email',
    );

    const endpoint = new URL(userinfoEndpoint);

    const response = await agent
      .get(`${endpoint.pathname}${endpoint.search}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.sub).toEqual(expect.any(String));
    expect(response.body.sub.length).toBeGreaterThan(0);
  });

  it('rejects a missing access token', async () => {
    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    const endpoint = new URL(discovery.body.userinfo_endpoint);

    const response = await request(baseUrl).get(
      `${endpoint.pathname}${endpoint.search}`,
    );

    expect([400, 401]).toContain(response.status);
  });

  it('rejects an invalid access token', async () => {
    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    const endpoint = new URL(discovery.body.userinfo_endpoint);

    const response = await request(baseUrl)
      .get(`${endpoint.pathname}${endpoint.search}`)
      .set('Authorization', 'Bearer invalid-access-token');

    expect([400, 401]).toContain(response.status);
  });

  it('returns roles when the roles scope is requested', async () => {
    const { agent, accessToken, userinfoEndpoint } = await obtainAccessToken(
      'openid profile email roles',
    );

    const endpoint = new URL(userinfoEndpoint);

    const response = await agent
      .get(`${endpoint.pathname}${endpoint.search}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.sub).toEqual(expect.any(String));
    expect(response.body.roles).toEqual(expect.any(Array));
  });
});
