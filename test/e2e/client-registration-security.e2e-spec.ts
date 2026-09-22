import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Client Registration Security (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';
  const adminRedirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  const redirectUri = () =>
    `http://localhost/registered-callback-${Date.now()}-${randomBytes(4).toString('hex')}`;

  function createPkce() {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return { codeVerifier, codeChallenge };
  }

  async function authenticateAdmin(): Promise<string> {
    const agent = request.agent(baseUrl);
    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const { authorization_endpoint, token_endpoint } = discovery.body;
    const { codeVerifier, codeChallenge } = createPkce();

    const authorizationUrl = new URL(authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set(
      'state',
      `registration-security-${Date.now()}`,
    );
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const authorization = await agent
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(authorization.status);

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
      .send({ username: adminUsername, password: adminPassword })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);
    expect(login.headers.location).toBeDefined();

    let currentAfterLogin = new URL(login.headers.location, baseUrl);
    let consentUid: string | undefined;

    for (let i = 0; i < 10; i++) {
      if (currentAfterLogin.pathname.startsWith('/interaction/')) {
        consentUid = currentAfterLogin.pathname
          .split('/')
          .filter(Boolean)
          .pop();
        break;
      }

      const response = await agent
        .get(`${currentAfterLogin.pathname}${currentAfterLogin.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.location).toBeDefined();
      currentAfterLogin = new URL(response.headers.location, baseUrl);
    }

    expect(consentUid).toBeDefined();

    const consent = await agent
      .post(`/interaction/${consentUid}/consent`)
      .send({ decision: 'accept' })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
    expect(consent.headers.location).toBeDefined();

    let callbackUrl = new URL(consent.headers.location, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (callbackUrl.pathname === '/idp-admin/callback.html') break;

      const response = await agent
        .get(`${callbackUrl.pathname}${callbackUrl.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.location).toBeDefined();
      callbackUrl = new URL(response.headers.location, baseUrl);
    }

    expect(callbackUrl.pathname).toBe('/idp-admin/callback.html');

    const error = callbackUrl.searchParams.get('error');
    if (error) {
      throw new Error(
        `OIDC admin authentication failed: ${error}: ${
          callbackUrl.searchParams.get('error_description') ?? ''
        }`,
      );
    }

    const code = callbackUrl.searchParams.get('code');
    expect(code).toBeDefined();

    const token = await agent
      .post(new URL(token_endpoint).pathname)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: adminRedirectUri,
        client_id: adminClientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeDefined();
    return token.body.access_token;
  }

  async function createInitialAccessToken(): Promise<string> {
    const accessToken = await authenticateAdmin();

    const response = await request(baseUrl)
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(response.body.token).toBeDefined();
    return response.body.token;
  }

  async function register(token: string, payload: Record<string, unknown>) {
    return request(baseUrl)
      .post('/reg')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send(payload);
  }

  function validPayload(overrides: Record<string, unknown> = {}) {
    return {
      client_name: `Registration Security Client ${Date.now()}-${randomBytes(3).toString('hex')}`,
      redirect_uris: [redirectUri()],
      scope: 'openid profile email',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      interaction_mode: 'hosted',
      ...overrides,
    };
  }

  it('rejects registration without an initial access token', async () => {
    const response = await request(baseUrl)
      .post('/reg')
      .set('Accept', 'application/json')
      .send(validPayload());

    expect([400, 401]).toContain(response.status);
    expect(response.body.error).toBeDefined();
  });

  it('rejects registration with an invalid initial access token', async () => {
    const response = await request(baseUrl)
      .post('/reg')
      .set('Authorization', 'Bearer definitely-invalid-registration-token')
      .set('Accept', 'application/json')
      .send(validPayload());

    expect([400, 401]).toContain(response.status);
    expect(response.body.error).toBeDefined();
  });

  it('rejects malformed registration JSON', async () => {
    const token = await createInitialAccessToken();

    const response = await request(baseUrl)
      .post('/reg')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send('{"client_name":');

    expect([400, 415]).toContain(response.status);
  });

  it('accepts registration without client_name and assigns a provider-generated client identity', async () => {
    const token = await createInitialAccessToken();
    const payload = validPayload();
    delete payload.client_name;

    const response = await register(token, payload);

    expect(response.status).toBe(201);
    expect(response.body.client_id).toBeDefined();
    expect(typeof response.body.client_id).toBe('string');
  });

  it('rejects registration without redirect_uris', async () => {
    const token = await createInitialAccessToken();
    const payload = validPayload();
    delete payload.redirect_uris;

    const response = await register(token, payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects an invalid redirect URI scheme', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({ redirect_uris: ['javascript:alert(1)'] }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects an unsupported grant type', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({ grant_types: ['not-a-real-grant'] }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects an unsupported response type', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({ response_types: ['not-a-real-response'] }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects an unsupported scope', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({ scope: 'openid scope-that-does-not-exist' }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('rejects an unsupported token endpoint authentication method', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({
        token_endpoint_auth_method: 'not-a-real-auth-method',
      }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  it('accepts a valid public client registration', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.client_id).toBeDefined();
    expect(response.body.client_secret).toBeUndefined();
    expect(response.body.redirect_uris).toBeDefined();
  });

  it('accepts a valid confidential client registration', async () => {
    const token = await createInitialAccessToken();

    const response = await register(
      token,
      validPayload({
        token_endpoint_auth_method: 'client_secret_basic',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.client_id).toBeDefined();
    expect(response.body.client_secret).toBeDefined();
  });
});
