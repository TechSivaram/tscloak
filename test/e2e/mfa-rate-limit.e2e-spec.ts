import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('MFA rate limiting E2E', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const adminUsername =
    process.env.E2E_ADMIN_USERNAME ?? process.env.E2E_USERNAME ?? 'admin';

  const adminPassword =
    process.env.E2E_ADMIN_PASSWORD ??
    process.env.E2E_PASSWORD ??
    'Password123!';

  const adminRedirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';

  const testRedirectUri =
    process.env.E2E_TEST_REDIRECT_URI ??
    'http://localhost:3000/e2e/mfa-rate-limit/callback';

  let adminAccessToken: string;
  let testClientId: string;
  let testUsername: string;
  let testPassword: string;
  let testAccessToken: string;

  // Authenticate a user without MFA
  // ------------------------------------------------------------

  function createPkce(): {
    codeVerifier: string;
    codeChallenge: string;
  } {
    const codeVerifier = randomBytes(32).toString('base64url');

    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
    };
  }

  // ------------------------------------------------------------
  // Redirect helper
  // ------------------------------------------------------------

  async function followRedirects(
    agent: request.SuperAgentTest,
    location: string,
    stopAt?: string,
  ) {
    let currentUrl = new URL(location, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (stopAt) {
        const stopUrl = new URL(stopAt, baseUrl);

        if (
          currentUrl.origin === stopUrl.origin &&
          currentUrl.pathname === stopUrl.pathname
        ) {
          return {
            response: undefined,
            url: currentUrl,
          };
        }
      }

      const response = await agent
        .get(`${currentUrl.pathname}${currentUrl.search}`)
        .redirects(0);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return {
          response,
          url: currentUrl,
        };
      }

      const nextLocation = response.headers.location;

      if (!nextLocation) {
        throw new Error(
          `Redirect ${response.status} does not contain Location`,
        );
      }

      currentUrl = new URL(nextLocation, baseUrl);
    }

    throw new Error('OIDC flow exceeded redirect limit');
  }

  // ------------------------------------------------------------
  // Find interaction UID
  // ------------------------------------------------------------

  async function getInteractionUid(
    agent: request.SuperAgentTest,
    location: string,
  ): Promise<string> {
    let currentUrl = new URL(location, baseUrl);

    for (let i = 0; i < 10; i++) {
      if (currentUrl.pathname.startsWith('/interaction/')) {
        const uid = currentUrl.pathname.split('/').filter(Boolean).pop();

        if (!uid) {
          throw new Error('Interaction URL did not contain UID');
        }

        return uid;
      }

      const response = await agent
        .get(`${currentUrl.pathname}${currentUrl.search}`)
        .redirects(0);

      expect([301, 302, 303, 307, 308]).toContain(response.status);

      if (!response.headers.location) {
        throw new Error('OIDC redirect did not contain Location');
      }

      currentUrl = new URL(response.headers.location, baseUrl);
    }

    throw new Error('Could not locate OIDC interaction UID');
  }

  async function authenticateWithoutMfa(
    loginUsername: string,
    loginPassword: string,
    oidcClientId: string,
    oidcRedirectUri: string,
  ): Promise<string> {
    const agent = request.agent(baseUrl);

    const { codeVerifier, codeChallenge } = createPkce();

    const authUrl = new URL(`${baseUrl}/auth`);

    authUrl.searchParams.set('client_id', oidcClientId);

    authUrl.searchParams.set('redirect_uri', oidcRedirectUri);

    authUrl.searchParams.set('response_type', 'code');

    authUrl.searchParams.set('scope', 'openid profile email');

    authUrl.searchParams.set('state', randomBytes(16).toString('hex'));

    authUrl.searchParams.set('code_challenge', codeChallenge);

    authUrl.searchParams.set('code_challenge_method', 'S256');

    authUrl.searchParams.set(
      'claims',
      JSON.stringify({
        id_token: {
          amr: {
            essential: true,
          },
        },
      }),
    );

    const authorization = await agent
      .get(`${authUrl.pathname}${authUrl.search}`)
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(authorization.status);

    expect(authorization.headers.location).toBeDefined();

    const interactionUid = await getInteractionUid(
      agent,
      authorization.headers.location,
    );

    await agent.get(`/interaction/${interactionUid}`).expect(200);

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({
        username: loginUsername,
        password: loginPassword,
      })
      .redirects(0);

    if (![200, 301, 302, 303, 307, 308].includes(login.status)) {
      console.error('[MFA E2E] OIDC login failed:', {
        username: loginUsername,
        clientId: oidcClientId,
        status: login.status,
        body: login.text,
      });
    }

    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let consentUid = interactionUid;

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();

      const result = await followRedirects(agent, login.headers.location);

      expect(result.response.status).toBe(200);

      if (result.url.pathname.startsWith('/interaction/')) {
        consentUid = result.url.pathname
          .split('/')
          .filter(Boolean)
          .pop() as string;
      }
    }

    const consentPage = await agent
      .get(`/interaction/${consentUid}`)
      .expect(200);

    expect(consentPage.text.toLowerCase()).toContain('consent');

    const consent = await agent
      .post(`/interaction/${consentUid}/consent`)
      .send({
        decision: 'accept',
      })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(consent.status);

    expect(consent.headers.location).toBeDefined();

    const callback = await followRedirects(
      agent,
      consent.headers.location,
      oidcRedirectUri,
    );

    expect(callback.url.toString()).toContain(oidcRedirectUri);
    expect(callback.url.searchParams.get('error')).toBeNull();

    const code = callback.url.searchParams.get('code');

    expect(code).toBeTruthy();

    const token = await agent
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oidcRedirectUri,
        client_id: oidcClientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeTruthy();

    return token.body.access_token;
  }

  // ------------------------------------------------------------

  async function createTestClient(): Promise<void> {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;

    const response = await request(baseUrl)
      .post('/api/admin/clients')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        name: `E2E MFA Rate Limit Client ${suffix}`,
        redirectUris: [testRedirectUri],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid', 'profile', 'email'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuthMethods: ['none'],
        interactionMode: 'hosted',
      });

    if (response.status !== 201) {
      console.error('[MFA rate-limit E2E] createTestClient failed:', {
        status: response.status,
        body: response.text,
      });
    }

    expect(response.status).toBe(201);
    expect(response.body.clientId).toBeTruthy();

    testClientId = response.body.clientId;
  }

  async function createTestUser(): Promise<void> {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;

    testUsername = `e2e-mfa-rate-${suffix}`;
    testPassword = 'Password123!';

    const response = await request(baseUrl)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        username: testUsername,
        email: `${testUsername}@example.com`,
        password: testPassword,
        clientId: testClientId,
      });

    if (response.status !== 201) {
      console.error('[MFA rate-limit E2E] createTestUser failed:', {
        status: response.status,
        body: response.text,
        username: testUsername,
        clientId: testClientId,
      });
    }

    expect(response.status).toBe(201);
  }

  beforeAll(async () => {
    try {
      adminAccessToken = await authenticateWithoutMfa(
        adminUsername,
        adminPassword,
        adminClientId,
        adminRedirectUri,
      );

      expect(adminAccessToken).toBeTruthy();

      await createTestClient();
      await createTestUser();

      testAccessToken = await authenticateWithoutMfa(
        testUsername,
        testPassword,
        testClientId,
        testRedirectUri,
      );

      expect(testAccessToken).toBeTruthy();
    } catch (error) {
      console.error('[MFA rate-limit E2E] setup failed:', error);
      throw error;
    }
  });

  afterAll(async () => {
    try {
      if (testClientId && adminAccessToken) {
        await request(baseUrl)
          .delete(`/api/admin/clients/${encodeURIComponent(testClientId)}`)
          .set('Authorization', `Bearer ${adminAccessToken}`);
      }
    } catch {
      // Cleanup must never hide the actual test result.
    }
  });

  it('authenticates a fresh user and rate-limits invalid MFA enrollment verification attempts', async () => {
    expect(testAccessToken).toBeTruthy();

    const enrollResponse = await request(baseUrl)
      .post('/api/mfa/enroll')
      .set('Authorization', `Bearer ${testAccessToken}`);

    expect([200, 201]).toContain(enrollResponse.status);
    expect(enrollResponse.body).toHaveProperty('secret');
    expect(enrollResponse.body).toHaveProperty('otpauthUri');

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await request(baseUrl)
        .post('/api/mfa/enroll/verify')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          code: '000000',
        });

      expect(response.status).toBe(400);
    }

    const blockedResponse = await request(baseUrl)
      .post('/api/mfa/enroll/verify')
      .set('Authorization', `Bearer ${testAccessToken}`)
      .send({
        code: '000000',
      });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.text).toContain(
      'Too many MFA verification attempts',
    );
  });
});
