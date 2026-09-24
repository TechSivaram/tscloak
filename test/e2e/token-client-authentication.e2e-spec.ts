import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Token Endpoint - Client Authentication (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';
  const adminRedirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  type AuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

  interface TestClient {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    authMethod: AuthMethod;
    username: string;
    password: string;
  }

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
  ): Promise<URL> {
    let current = new URL(location, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (current.origin !== new URL(baseUrl).origin) {
        return current;
      }

      const response = await agent
        .get(`${current.pathname}${current.search}`)
        .redirects(0);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return current;
      }

      expect(response.headers.location).toBeDefined();
      current = new URL(response.headers.location, baseUrl);
    }

    throw new Error('Too many redirects while following OIDC flow');
  }

  async function authenticateAdmin(): Promise<string> {
    const agent = request.agent(baseUrl);
    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const {
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
    } = discovery.body;
    const { codeVerifier, codeChallenge } = createPkce();

    const authorizationUrl = new URL(authorizationEndpoint);
    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set('state', `e2e-admin-${Date.now()}`);
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

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({ username: adminUsername, password: adminPassword })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let callbackUrl: URL;
    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();
      callbackUrl = await followRedirects(agent, login.headers.location);
    } else {
      const resumed = await agent
        .get(`/interaction/${interactionUid}`)
        .redirects(0);
      expect([301, 302, 303, 307, 308]).toContain(resumed.status);
      expect(resumed.headers.location).toBeDefined();
      callbackUrl = await followRedirects(agent, resumed.headers.location);
    }

    if (callbackUrl.pathname.startsWith('/interaction/')) {
      const consentUid = callbackUrl.pathname.split('/').filter(Boolean).pop();
      expect(consentUid).toBeDefined();

      const consent = await agent
        .post(`/interaction/${consentUid}/consent`)
        .send({ decision: 'accept' })
        .redirects(0);

      expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
      expect(consent.headers.location).toBeDefined();
      callbackUrl = await followRedirects(agent, consent.headers.location);
    }

    expect(callbackUrl.pathname).toBe('/idp-admin/callback.html');
    expect(callbackUrl.searchParams.get('error')).toBeNull();

    const code = callbackUrl.searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenUrl = new URL(tokenEndpoint);
    const token = await agent
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: adminRedirectUri,
        client_id: adminClientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toEqual(expect.any(String));
    return token.body.access_token;
  }

  async function registerClient(
    authMethod: AuthMethod,
    accessToken: string,
  ): Promise<TestClient> {
    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    const initial = await request(baseUrl)
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const redirectUri = `http://localhost/e2e/callback-${randomBytes(8).toString('hex')}`;
    const registrationEndpoint = new URL(discovery.body.registration_endpoint);

    const registration = await request(baseUrl)
      .post(`${registrationEndpoint.pathname}${registrationEndpoint.search}`)
      .set('Authorization', `Bearer ${initial.body.token}`)
      .set('Accept', 'application/json')
      .send({
        client_name: `E2E Token Auth ${authMethod} ${Date.now()}`,
        redirect_uris: [redirectUri],
        scope: 'openid profile email',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: authMethod,
        interaction_mode: 'hosted',
      })
      .expect(201);

    expect(registration.body.client_id).toEqual(expect.any(String));

    if (authMethod === 'none') {
      expect(registration.body.client_secret).toBeUndefined();
    } else {
      expect(registration.body.client_secret).toEqual(expect.any(String));
    }

    const username = `token-auth-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'TokenAuth123!';

    const user = await request(baseUrl)
      .post('/api/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: registration.body.client_id,
      })
      .expect(201);

    expect(user.body.id).toBeDefined();
    expect(user.body.username).toBe(username);

    return {
      clientId: registration.body.client_id,
      clientSecret: registration.body.client_secret,
      redirectUri,
      authMethod,
      username,
      password,
    };
  }

  async function obtainAuthorizationCode(client: TestClient) {
    const agent = request.agent(baseUrl);
    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const { codeVerifier, codeChallenge } = createPkce();
    const authorizationUrl = new URL(discovery.body.authorization_endpoint);

    authorizationUrl.searchParams.set('client_id', client.clientId);
    authorizationUrl.searchParams.set('redirect_uri', client.redirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
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

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({ username: client.username, password: client.password })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let nextLocation: string | undefined = login.headers.location;

    if (!nextLocation) {
      const resumed = await agent
        .get(`/interaction/${interactionUid}`)
        .redirects(0);
      expect([301, 302, 303, 307, 308]).toContain(resumed.status);
      nextLocation = resumed.headers.location;
    }

    expect(nextLocation).toBeDefined();

    let resumedUrl = new URL(nextLocation, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (resumedUrl.pathname.startsWith('/interaction/')) {
        break;
      }

      if (resumedUrl.origin !== new URL(baseUrl).origin) {
        break;
      }

      const response = await agent
        .get(`${resumedUrl.pathname}${resumedUrl.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.location).toBeDefined();
      resumedUrl = new URL(response.headers.location, baseUrl);
    }

    if (resumedUrl.pathname.startsWith('/interaction/')) {
      const consentUid = resumedUrl.pathname.split('/').filter(Boolean).pop();
      expect(consentUid).toBeDefined();

      const consent = await agent
        .post(`/interaction/${consentUid}/consent`)
        .send({ decision: 'accept' })
        .redirects(0);

      expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
      expect(consent.headers.location).toBeDefined();
      resumedUrl = await followRedirects(agent, consent.headers.location);
    }

    const callback = resumedUrl;
    expect(callback.pathname).toBe(new URL(client.redirectUri).pathname);
    expect(callback.searchParams.get('error')).toBeNull();

    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();

    return {
      agent,
      code: code as string,
      codeVerifier,
      tokenEndpoint: discovery.body.token_endpoint as string,
    };
  }

  async function exchangeCode(
    client: TestClient,
    authorization: Awaited<ReturnType<typeof obtainAuthorizationCode>>,
    options: {
      includeClientId?: boolean;
      clientId?: string;
      clientSecret?: string;
      useBasicAuth?: boolean;
    } = {},
  ) {
    const tokenUrl = new URL(authorization.tokenEndpoint);
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code: authorization.code,
      redirect_uri: client.redirectUri,
      code_verifier: authorization.codeVerifier,
    };

    const includeClientId = options.includeClientId ?? true;
    if (includeClientId && !options.useBasicAuth) {
      body.client_id = options.clientId ?? client.clientId;
    }

    if (!options.useBasicAuth && options.clientSecret !== undefined) {
      body.client_secret = options.clientSecret;
    }

    let req = request(baseUrl)
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .type('form');

    if (options.useBasicAuth) {
      req = req.auth(
        options.clientId ?? client.clientId,
        options.clientSecret ?? client.clientSecret ?? '',
      );
    }

    return req.send(body);
  }

  let adminAccessToken: string;

  beforeAll(async () => {
    adminAccessToken = await authenticateAdmin();
  });

  it('accepts client_secret_basic authentication with valid credentials', async () => {
    const client = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      useBasicAuth: true,
    });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toEqual(expect.any(String));
  });

  it('rejects client_secret_basic authentication with a missing secret', async () => {
    const client = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      useBasicAuth: true,
      clientSecret: '',
    });

    expect([400, 401]).toContain(response.status);
  });

  it('rejects client_secret_basic authentication with an incorrect secret', async () => {
    const client = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      useBasicAuth: true,
      clientSecret: 'definitely-not-the-client-secret',
    });

    expect([400, 401]).toContain(response.status);
  });

  it('accepts client_secret_post authentication with valid credentials', async () => {
    const client = await registerClient('client_secret_post', adminAccessToken);
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      clientSecret: client.clientSecret,
    });

    expect(response.status).toBe(200);
    expect(response.body.access_token).toEqual(expect.any(String));
  });

  it('rejects client_secret_post authentication with an incorrect secret', async () => {
    const client = await registerClient('client_secret_post', adminAccessToken);
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      clientSecret: 'definitely-not-the-client-secret',
    });

    expect([400, 401]).toContain(response.status);
  });

  it('allows a public client to exchange an authorization code without a client secret', async () => {
    const client = await registerClient('none', adminAccessToken);
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization);

    expect(response.status).toBe(200);
    expect(response.body.access_token).toEqual(expect.any(String));
  });

  it('rejects a public client when an unexpected client secret is supplied', async () => {
    const client = await registerClient('none', adminAccessToken);
    const authorization = await obtainAuthorizationCode(client);

    const response = await exchangeCode(client, authorization, {
      clientSecret: 'unexpected-secret',
    });

    expect([400, 401]).toContain(response.status);
  });

  it('rejects a code belonging to client A when authenticated as client B', async () => {
    const clientA = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const clientB = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(clientA);

    const response = await exchangeCode(clientA, authorization, {
      useBasicAuth: true,
      clientId: clientB.clientId,
      clientSecret: clientB.clientSecret,
    });

    expect([400, 401]).toContain(response.status);
  });

  it('rejects conflicting Basic and POST client credentials', async () => {
    const client = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(client);
    const tokenUrl = new URL(authorization.tokenEndpoint);

    const response = await request(baseUrl)
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .auth(client.clientId, client.clientSecret ?? '')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        redirect_uri: client.redirectUri,
        code_verifier: authorization.codeVerifier,
        client_id: client.clientId,
        client_secret: 'different-secret',
      });

    expect([400, 401]).toContain(response.status);
  });

  it('rejects malformed Basic client authentication', async () => {
    const client = await registerClient(
      'client_secret_basic',
      adminAccessToken,
    );
    const authorization = await obtainAuthorizationCode(client);
    const tokenUrl = new URL(authorization.tokenEndpoint);

    const response = await request(baseUrl)
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .set('Authorization', 'Basic not-valid-base64')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        redirect_uri: client.redirectUri,
        code_verifier: authorization.codeVerifier,
      });

    expect([400, 401]).toContain(response.status);
  });
});
