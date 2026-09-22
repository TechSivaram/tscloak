import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Token Introspection endpoint (e2e)', () => {
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
  ): Promise<{ response: request.Response; url: URL }> {
    let url = new URL(location, baseUrl);

    for (let i = 0; i < 10; i += 1) {
      const response = await agent
        .get(`${url.pathname}${url.search}`)
        .redirects(0);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, url };
      }

      expect(response.headers.location).toBeDefined();
      url = new URL(response.headers.location, url);
    }

    throw new Error('Too many redirects while processing OIDC flow');
  }

  async function obtainAdminAccessToken(): Promise<string> {
    const agent = request.agent(baseUrl);

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const authorizationEndpoint = discovery.body.authorization_endpoint;
    const tokenEndpoint = discovery.body.token_endpoint;

    expect(authorizationEndpoint).toBeDefined();
    expect(tokenEndpoint).toBeDefined();

    const { codeVerifier, codeChallenge } = createPkce();
    const authorizationUrl = new URL(authorizationEndpoint);

    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set(
      'state',
      `e2e-introspection-${Date.now()}`,
    );
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
      .send({ decision: 'accept' })
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
    expect(consent.headers.location).toBeDefined();

    let callbackUrl = new URL(consent.headers.location, baseUrl);

    let callback: URL | undefined;

    for (let i = 0; i < 10; i += 1) {
      if (callbackUrl.toString().split('?')[0] === adminRedirectUri) {
        callback = callbackUrl;
        break;
      }

      const response = await agent
        .get(`${callbackUrl.pathname}${callbackUrl.search}`)
        .redirects(0);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        expect(response.headers.location).toBeDefined();

        callbackUrl = new URL(response.headers.location, callbackUrl);
        continue;
      }

      throw new Error(
        `Unexpected response while completing admin authorization: ` +
          `${response.status} ${response.text}`,
      );
    }

    expect(callback).toBeDefined();

    const error = callback!.searchParams.get('error');

    if (error) {
      throw new Error(
        `Admin OIDC authorization failed: ${error}: ${
          callback!.searchParams.get('error_description') ?? ''
        }`,
      );
    }

    const code = callback!.searchParams.get('code');
    expect(code).toBeDefined();

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

  async function getIntrospectionEndpoint(): Promise<string> {
    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    expect(discovery.body.introspection_endpoint).toBeDefined();

    return discovery.body.introspection_endpoint;
  }

  async function introspect(token: string): Promise<request.Response> {
    const endpoint = await getIntrospectionEndpoint();

    return request(baseUrl).post(new URL(endpoint).pathname).type('form').send({
      token,
      client_id: adminClientId,
    });
  }

  it('introspects a valid access token as active', async () => {
    const accessToken = await obtainAdminAccessToken();
    const response = await introspect(accessToken);

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(true);
    expect(response.body.client_id).toBe(adminClientId);
    expect(response.body.token_type).toBeDefined();
    expect(response.body.exp).toBeDefined();
    expect(response.body.iat).toBeDefined();
    expect(response.body.sub).toBeDefined();
  });

  it('returns active=false for an invalid access token', async () => {
    const response = await introspect('invalid-access-token-for-introspection');

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
  });
});
