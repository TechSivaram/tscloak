import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Authentication (e2e)', () => {
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

      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }

      url = new URL(response.headers.location, baseUrl);
    }

    throw new Error('Too many redirects while processing OIDC flow');
  }

  it('should complete authorization-code authentication', async () => {
    const agent = request.agent(baseUrl);

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const { authorization_endpoint, token_endpoint } = discovery.body;

    expect(authorization_endpoint).toBeDefined();
    expect(token_endpoint).toBeDefined();

    const { codeVerifier, codeChallenge } = createPkce();
    const authorizationUrl = new URL(authorization_endpoint);

    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
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

    const loginPage = await agent
      .get(`/interaction/${interactionUid}`)
      .expect(200);

    expect(loginPage.text.toLowerCase()).toContain('login');

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({ username, password })
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

    // interaction.finished() first redirects back to the OIDC
    // authorization endpoint (for this provider this is /auth/:uid).
    // The authorization endpoint then resumes the request and redirects
    // to the client's redirect_uri.
    expect(consent.headers.location).toBeDefined();

    const callbackResult = await followRedirects(
      agent,
      consent.headers.location,
    );

    expect([200, 301, 302, 303, 307, 308]).toContain(
      callbackResult.response.status,
    );

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

    const tokenUrl = new URL(token_endpoint);

    const token = await agent
      .post(`${tokenUrl.pathname}${tokenUrl.search}`)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeDefined();
    expect(token.body.token_type).toBeDefined();
    expect(token.body.expires_in).toBeDefined();
  });
});
