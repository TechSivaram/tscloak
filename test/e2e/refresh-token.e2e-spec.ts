import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Refresh Token endpoint (e2e)', () => {
  jest.setTimeout(30_000);

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin';

  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

  const adminRedirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  // Redirect URI registered for the dynamically created refresh client.
  // The E2E test stops when this URL is reached and reads the authorization
  // code from the Location header; it does not GET this callback page.
  const refreshRedirectUri =
    process.env.E2E_REFRESH_REDIRECT_URI ??
    'http://localhost:3000/refresh/callback.html';

  interface RegisteredClient {
    clientId: string;
    clientSecret?: string;
    username: string;
    password: string;
  }

  interface AuthorizationResult {
    agent: request.SuperAgentTest;
    code: string;
    codeVerifier: string;
    tokenEndpoint: string;
    client: RegisteredClient;
  }

  interface TokenResult extends AuthorizationResult {
    accessToken: string;
    refreshToken: string;
  }

  function createPkce() {
    const codeVerifier = randomBytes(32).toString('base64url');

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
    };
  }

  async function followRedirects(
    agent: request.SuperAgentTest,
    location: string,
  ): Promise<{
    response: request.Response;
    url: URL;
  }> {
    let url = new URL(location, baseUrl);

    for (let i = 0; i < 10; i += 1) {
      const response = await agent
        .get(`${url.pathname}${url.search}`)
        .redirects(0);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, url };
      }

      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }

      url = new URL(response.headers.location, url);
    }

    throw new Error('Too many redirects while processing OIDC flow');
  }

  async function authenticateAdmin(
    agent: request.SuperAgentTest,
  ): Promise<string> {
    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const authorizationEndpoint = discovery.body.authorization_endpoint;

    expect(authorizationEndpoint).toBeDefined();

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

    for (let i = 0; i < 10; i += 1) {
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
      .send({
        username: adminUsername,
        password: adminPassword,
      })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let consentUid = interactionUid;
    let consentPage = login;

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();

      const result = await followRedirects(agent, login.headers.location);

      consentPage = result.response;

      if (result.url.pathname.startsWith('/interaction/')) {
        consentUid = result.url.pathname.split('/').filter(Boolean).pop();
      }
    }

    expect(consentUid).toBeDefined();
    expect(consentPage.status).toBe(200);
    expect(consentPage.text.toLowerCase()).toContain('consent');

    const consent = await agent
      .post(`/interaction/${consentUid}/consent`)
      .send({
        decision: 'accept',
      })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
    expect(consent.headers.location).toBeDefined();

    const callbackResult = await followRedirects(
      agent,
      consent.headers.location,
    );

    const callback = callbackResult.url;

    expect(callback.pathname).toBe('/idp-admin/callback.html');

    const error = callback.searchParams.get('error');

    if (error) {
      throw new Error(
        `Admin OIDC authorization failed: ${error}: ${
          callback.searchParams.get('error_description') ?? ''
        }`,
      );
    }

    const code = callback.searchParams.get('code');

    expect(code).toBeDefined();

    const discoveryAfterFlow = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const tokenEndpoint = discoveryAfterFlow.body.token_endpoint;

    expect(tokenEndpoint).toBeDefined();

    const token = await agent
      .post(new URL(tokenEndpoint).pathname)
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

  async function registerRefreshClient(
    agent: request.SuperAgentTest,
  ): Promise<RegisteredClient> {
    const adminAccessToken = await authenticateAdmin(agent);

    const initialTokenResponse = await agent
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(201);

    expect(initialTokenResponse.body.token).toBeDefined();

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const registrationEndpoint = discovery.body.registration_endpoint;

    expect(registrationEndpoint).toBeDefined();

    const registration = await agent
      .post(new URL(registrationEndpoint).pathname)
      .set('Authorization', `Bearer ${initialTokenResponse.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({
        client_name: `E2E Refresh Token Client ${Date.now()}`,

        redirect_uris: [refreshRedirectUri],

        scope: 'openid profile email offline_access roles',

        grant_types: ['authorization_code', 'refresh_token'],

        response_types: ['code'],

        token_endpoint_auth_method: 'none',

        interaction_mode: 'hosted',
      })
      .expect(201);

    expect(registration.body.client_id).toBeDefined();
    expect(registration.body.grant_types).toEqual([
      'authorization_code',
      'refresh_token',
    ]);

    expect(registration.body.scope).toContain('offline_access');

    // Users are tenant/client scoped in TSCloak. The admin user
    // belongs to the admin client, so it cannot authenticate against
    // this newly registered client. Create a dedicated test user for
    // the refresh-token client before starting its authorization flow.
    const username = `refresh-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;

    const password = 'RefreshToken123!';

    const userResponse = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: registration.body.client_id,
      })
      .expect(201);

    expect(userResponse.body.id).toBeDefined();
    expect(userResponse.body.username).toBe(username);

    return {
      clientId: registration.body.client_id,
      clientSecret: registration.body.client_secret,
      username,
      password,
    };
  }

  async function obtainAuthorizationCode(
    scope = 'openid profile email offline_access roles',
  ): Promise<AuthorizationResult> {
    const agent = request.agent(baseUrl);

    const client = await registerRefreshClient(agent);

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const authorizationEndpoint = discovery.body.authorization_endpoint;

    const tokenEndpoint = discovery.body.token_endpoint;

    expect(authorizationEndpoint).toBeDefined();
    expect(tokenEndpoint).toBeDefined();

    const { codeVerifier, codeChallenge } = createPkce();

    const authorizationUrl = new URL(authorizationEndpoint);

    authorizationUrl.searchParams.set('client_id', client.clientId);
    authorizationUrl.searchParams.set('redirect_uri', refreshRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', scope);
    authorizationUrl.searchParams.set('prompt', 'consent');
    authorizationUrl.searchParams.set('state', randomBytes(16).toString('hex'));
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const authorization = await agent
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(authorization.status);
    expect(authorization.headers.location).toBeDefined();

    let current = new URL(authorization.headers.location, baseUrl);

    let interactionUid: string | undefined;

    for (let i = 0; i < 10; i += 1) {
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

    const loginPage = await agent
      .get(`/interaction/${interactionUid}`)
      .expect(200);

    expect(loginPage.text.toLowerCase()).toContain('login');

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({
        username: client.username,
        password: client.password,
      })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let consentUid = interactionUid;
    let consentPage = login;

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();

      const result = await followRedirects(agent, login.headers.location);

      consentPage = result.response;

      if (result.url.pathname.startsWith('/interaction/')) {
        consentUid = result.url.pathname.split('/').filter(Boolean).pop();
      }
    }

    expect(consentUid).toBeDefined();
    expect(consentPage.status).toBe(200);
    expect(consentPage.text.toLowerCase()).toContain('consent');

    const consent = await agent
      .post(`/interaction/${consentUid}/consent`)
      .send({
        decision: 'accept',
      })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
    expect(consent.headers.location).toBeDefined();

    // Consent completion may first redirect through an OIDC continuation
    // such as /auth/<uid>. Follow those intermediate redirects until the
    // registered client redirect URI is reached. Never GET the final
    // callback page; it only carries the authorization response.
    let authorizationContinuation = new URL(consent.headers.location, baseUrl);

    let callback: URL | undefined;

    for (let i = 0; i < 10; i += 1) {
      if (
        authorizationContinuation.toString().split('?')[0] ===
        refreshRedirectUri
      ) {
        callback = authorizationContinuation;
        break;
      }

      const response = await agent
        .get(
          `${authorizationContinuation.pathname}${authorizationContinuation.search}`,
        )
        .redirects(0);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        expect(response.headers.location).toBeDefined();
        authorizationContinuation = new URL(
          response.headers.location,
          authorizationContinuation,
        );
        continue;
      }

      throw new Error(
        `Unexpected response while completing refresh-client authorization: ` +
          `${response.status} ${response.text}`,
      );
    }

    expect(callback).toBeDefined();

    const error = callback!.searchParams.get('error');

    if (error) {
      throw new Error(
        `Refresh-client authorization failed: ${error}: ${
          callback.searchParams.get('error_description') ?? ''
        }`,
      );
    }

    const code = callback.searchParams.get('code');

    expect(code).toBeDefined();

    return {
      agent,
      code: code as string,
      codeVerifier,
      tokenEndpoint,
      client,
    };
  }

  async function obtainRefreshToken(): Promise<TokenResult> {
    const authorization = await obtainAuthorizationCode();

    const tokenEndpoint = new URL(authorization.tokenEndpoint);

    const token = await authorization.agent
      .post(`${tokenEndpoint.pathname}${tokenEndpoint.search}`)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: authorization.code,
        redirect_uri: refreshRedirectUri,
        client_id: authorization.client.clientId,
        code_verifier: authorization.codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeDefined();
    expect(token.body.token_type).toBe('Bearer');
    expect(token.body.refresh_token).toBeDefined();

    return {
      ...authorization,
      accessToken: token.body.access_token,
      refreshToken: token.body.refresh_token,
    };
  }

  it('issues a refresh token when offline_access is requested', async () => {
    const result = await obtainRefreshToken();

    expect(result.refreshToken).toEqual(expect.any(String));
    expect(result.refreshToken.length).toBeGreaterThan(0);
  });

  it('exchanges a valid refresh token for a new access token', async () => {
    const result = await obtainRefreshToken();

    const response = await result.agent
      .post(new URL(result.tokenEndpoint).pathname)
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: result.refreshToken,
        client_id: result.client.clientId,
      })
      .expect(200);

    expect(response.body.access_token).toBeDefined();
    expect(response.body.token_type).toBe('Bearer');
    expect(response.body.expires_in).toBeDefined();
  });

  it('rejects an invalid refresh token', async () => {
    const result = await obtainRefreshToken();

    await result.agent
      .post(new URL(result.tokenEndpoint).pathname)
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: 'invalid-refresh-token',
        client_id: result.client.clientId,
      })
      .expect((response) => {
        expect([400, 401]).toContain(response.status);
      });
  });

  it('accepts the refresh token for the registered client', async () => {
    const result = await obtainRefreshToken();

    const response = await result.agent
      .post(new URL(result.tokenEndpoint).pathname)
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: result.refreshToken,
        client_id: result.client.clientId,
      })
      .expect(200);

    expect(response.body.access_token).toBeDefined();
    expect(response.body.token_type).toBe('Bearer');

    if (response.body.refresh_token) {
      expect(response.body.refresh_token).toEqual(expect.any(String));
      expect(response.body.refresh_token.length).toBeGreaterThan(0);
    }
  });
});
