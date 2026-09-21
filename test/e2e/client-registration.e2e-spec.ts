import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Client Registration (e2e)', () => {
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

  async function authenticateAdmin(): Promise<string> {
    const agent = request.agent(baseUrl);

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const { authorization_endpoint, token_endpoint } = discovery.body;

    expect(authorization_endpoint).toBeDefined();
    expect(token_endpoint).toBeDefined();

    const { codeVerifier, codeChallenge } = createPkce();
    const authorizationUrl = new URL(authorization_endpoint);

    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
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

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();

      let redirect = new URL(login.headers.location, baseUrl);

      for (let i = 0; i < 10; i++) {
        if (redirect.pathname.startsWith('/interaction/')) {
          consentUid = redirect.pathname.split('/').filter(Boolean).pop();
          break;
        }

        const response = await agent
          .get(`${redirect.pathname}${redirect.search}`)
          .redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(response.status);
        expect(response.headers.location).toBeDefined();

        redirect = new URL(response.headers.location, baseUrl);
      }
    }

    expect(consentUid).toBeDefined();

    const consentPage = await agent
      .get(`/interaction/${consentUid}`)
      .expect(200);

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

    let callbackUrl = new URL(consent.headers.location, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (callbackUrl.pathname === '/idp-admin/callback.html') {
        break;
      }

      const response = await agent
        .get(`${callbackUrl.pathname}${callbackUrl.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(response.headers.location).toBeDefined();

      callbackUrl = new URL(response.headers.location, baseUrl);
    }

    const callback = callbackUrl;

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
        redirect_uri: adminRedirectUri,
        client_id: adminClientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeDefined();

    return token.body.access_token;
  }

  it('should create an initial access token and register a client', async () => {
    const accessToken = await authenticateAdmin();

    const initial = await request(baseUrl)
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(initial.body.token).toBeDefined();

    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    expect(discovery.body.registration_endpoint).toBeDefined();

    const registrationEndpoint = new URL(discovery.body.registration_endpoint);

    const clientName = `E2E Registered Client ${Date.now()}`;
    const redirectUri = 'http://localhost/registered-callback';

    const registration = await request(baseUrl)
      .post(`${registrationEndpoint.pathname}${registrationEndpoint.search}`)
      .set('Authorization', `Bearer ${initial.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({
        client_name: clientName,
        redirect_uris: [redirectUri],
        scope: 'openid profile email',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_basic',
        interaction_mode: 'hosted',
      })
      .expect(201);

    expect(registration.body.client_id).toBeDefined();
    expect(registration.body.client_secret).toBeDefined();
    expect(registration.body.client_name).toBe(clientName);
    expect(registration.body.redirect_uris).toEqual([redirectUri]);
  });
});
