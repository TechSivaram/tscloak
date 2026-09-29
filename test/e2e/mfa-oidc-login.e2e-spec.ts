import { createHash, createHmac, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC MFA Login (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  let clientId: string;

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
    'http://localhost:3000/e2e/mfa/callback';

  // ------------------------------------------------------------
  // Isolated test client + test user
  // ------------------------------------------------------------

  let testClientId: string;

  let testUsername: string;
  let testPassword: string;
  let testEmail: string;

  let adminAccessToken: string;

  let mfaSecret: string | undefined;
  let recoveryCodes: string[] = [];

  // ------------------------------------------------------------
  // TOTP helper
  // ------------------------------------------------------------

  function base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    const input = value.toUpperCase().replace(/[\s=-]/g, '');

    let bits = 0;
    let buffer = 0;

    const output: number[] = [];

    for (const char of input) {
      const index = alphabet.indexOf(char);

      if (index === -1) {
        throw new Error(`Invalid Base32 character: ${char}`);
      }

      buffer = (buffer << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bits -= 8;
        output.push((buffer >> bits) & 0xff);
      }
    }

    return Buffer.from(output);
  }

  function generateTotp(secret: string): string {
    const key = base32Decode(secret);

    const counter = Math.floor(Date.now() / 1000 / 30);

    const counterBuffer = Buffer.alloc(8);

    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const hmac = createHmac('sha1', key).update(counterBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;

    const code =
      ((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3];

    return String(code % 1_000_000).padStart(6, '0');
  }

  // ------------------------------------------------------------
  // PKCE
  // ------------------------------------------------------------

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

  // ------------------------------------------------------------
  // Authenticate a user without MFA
  // ------------------------------------------------------------

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
  // Create isolated OIDC test client
  // ------------------------------------------------------------

  async function createTestClient(): Promise<void> {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;

    const response = await request(baseUrl)
      .post('/api/admin/clients')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        name: `E2E MFA Client ${suffix}`,
        redirectUris: [testRedirectUri],
        postLogoutRedirectUris: [],
        allowedScopes: ['openid', 'profile', 'email'],
        grantTypes: ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        tokenEndpointAuthMethods: ['none'],
        interactionMode: 'hosted',
      });

    if (response.status !== 201) {
      console.error('[MFA E2E] createTestClient failed:', {
        status: response.status,
        body: response.text,
      });
    }

    expect(response.status).toBe(201);
    expect(response.body.clientId).toBeTruthy();

    testClientId = response.body.clientId;
    clientId = testClientId;
  }

  // ------------------------------------------------------------
  // Create isolated MFA test user
  // ------------------------------------------------------------

  async function createTestUser(): Promise<void> {
    const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;

    testUsername = `e2e-mfa-${suffix}`;

    testPassword = 'Password123!';

    testEmail = `${testUsername}@example.com`;

    const response = await request(baseUrl)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        username: testUsername,
        email: testEmail,
        password: testPassword,
        clientId: testClientId,
      });

    if (response.status !== 201) {
      console.error('[MFA E2E] createTestUser failed:', {
        status: response.status,
        body: response.text,
        username: testUsername,
        clientId: testClientId,
      });
    }

    expect(response.status).toBe(201);
  }

  // ------------------------------------------------------------
  // Enable MFA
  // ------------------------------------------------------------

  async function setupMfa() {
    const accessToken = await authenticateWithoutMfa(
      testUsername,
      testPassword,
      testClientId,
      testRedirectUri,
    );

    const enroll = await request(baseUrl)
      .post('/api/mfa/enroll')
      .set('Authorization', `Bearer ${accessToken}`);

    expect([200, 201]).toContain(enroll.status);

    expect(enroll.body.secret).toBeTruthy();

    expect(enroll.body.otpauthUri).toBeTruthy();

    mfaSecret = enroll.body.secret;

    const otp = generateTotp(mfaSecret);

    const verify = await request(baseUrl)
      .post('/api/mfa/enroll/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        code: otp,
      });

    /*
     * NestJS @Post() defaults to 201 Created.
     */
    expect([200, 201]).toContain(verify.status);

    expect(verify.body.enabled).toBe(true);

    expect(verify.body.method).toBe('totp');

    expect(verify.body.recoveryCodes).toBeDefined();

    expect(Array.isArray(verify.body.recoveryCodes)).toBe(true);

    expect(verify.body.recoveryCodes).toHaveLength(10);

    recoveryCodes = verify.body.recoveryCodes;

    expect(recoveryCodes.every((code) => typeof code === 'string')).toBe(true);
  }

  // ------------------------------------------------------------
  // Start OIDC login with MFA
  // ------------------------------------------------------------

  async function startMfaLogin() {
    const agent = request.agent(baseUrl);

    const { codeVerifier, codeChallenge } = createPkce();

    const authUrl = new URL(`${baseUrl}/auth`);

    authUrl.searchParams.set('client_id', clientId);

    authUrl.searchParams.set('redirect_uri', testRedirectUri);

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

    const login = await agent
      .post(`/interaction/${interactionUid}/login`)
      .send({
        username: testUsername,
        password: testPassword,
      })
      .redirects(0);

    /*
     * With MFA enabled, password authentication
     * must stop at the MFA challenge.
     */
    expect(login.status).toBe(200);

    expect(login.text.toLowerCase()).toContain('mfa');

    return {
      agent,
      interactionUid,
      codeVerifier,
    };
  }

  // ------------------------------------------------------------
  // Complete MFA login
  // ------------------------------------------------------------

  async function completeMfaLogin(
    agent: request.SuperAgentTest,
    interactionUid: string,
    codeVerifier: string,
    otp: string,
  ) {
    const mfa = await agent
      .post(`/interaction/${interactionUid}/mfa`)
      .send({
        method: 'totp',
        code: otp,
      })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(mfa.status);

    expect(mfa.headers.location).toBeDefined();

    /*
     * MFA success redirects back into oidc-provider.
     */
    const afterMfa = await followRedirects(agent, mfa.headers.location);

    let consentUid: string | undefined;

    if (afterMfa.url.pathname.startsWith('/interaction/')) {
      consentUid = afterMfa.url.pathname.split('/').filter(Boolean).pop();
    }

    expect(consentUid).toBeDefined();

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
      testRedirectUri,
    );

    expect(callback.url.toString()).toContain(testRedirectUri);

    expect(callback.url.searchParams.get('error')).toBeNull();

    const code = callback.url.searchParams.get('code');

    expect(code).toBeTruthy();

    const token = await agent
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: testRedirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeTruthy();

    expect(token.body.id_token).toBeTruthy();

    return token.body;
  }

  // ------------------------------------------------------------
  // Complete MFA login with recovery code
  // ------------------------------------------------------------

  async function completeRecoveryCodeLogin(
    agent: request.SuperAgentTest,
    interactionUid: string,
    codeVerifier: string,
    recoveryCode: string,
  ) {
    const mfa = await agent
      .post(`/interaction/${interactionUid}/mfa`)
      .send({
        method: 'recovery',
        code: recoveryCode,
      })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(mfa.status);

    expect(mfa.headers.location).toBeDefined();

    /*
     * Recovery-code success redirects back into oidc-provider.
     */
    const afterMfa = await followRedirects(agent, mfa.headers.location);

    let consentUid: string | undefined;

    if (afterMfa.url.pathname.startsWith('/interaction/')) {
      consentUid = afterMfa.url.pathname.split('/').filter(Boolean).pop();
    }

    expect(consentUid).toBeDefined();

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
      testRedirectUri,
    );

    expect(callback.url.toString()).toContain(testRedirectUri);

    expect(callback.url.searchParams.get('error')).toBeNull();

    const code = callback.url.searchParams.get('code');

    expect(code).toBeTruthy();

    const token = await agent
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: testRedirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      })
      .expect(200);

    expect(token.body.access_token).toBeTruthy();

    expect(token.body.id_token).toBeTruthy();

    return token.body;
  }

  // ------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------

  beforeAll(async () => {
    /*
     * Create a fresh client and user for this entire test suite.
     * MFA is never enabled on the admin account.
     */
    try {
      adminAccessToken = await authenticateWithoutMfa(
        adminUsername,
        adminPassword,
        adminClientId,
        adminRedirectUri,
      );

      await createTestClient();
      await createTestUser();
      await setupMfa();
    } catch (error) {
      console.error('[MFA E2E] beforeAll setup failed:', error);
      throw error;
    }
  });

  // ------------------------------------------------------------
  // Cleanup
  // ------------------------------------------------------------

  afterAll(async () => {
    try {
      /*
       * Disable MFA only on the isolated test user.
       * The admin account is never modified by this test.
       */
      if (mfaSecret) {
        const { agent, interactionUid, codeVerifier } = await startMfaLogin();

        const otp = generateTotp(mfaSecret);

        const tokenSet = await completeMfaLogin(
          agent,
          interactionUid,
          codeVerifier,
          otp,
        );

        if (tokenSet.access_token) {
          const disableOtp = generateTotp(mfaSecret);

          await request(baseUrl)
            .post('/api/mfa/disable')
            .set('Authorization', `Bearer ${tokenSet.access_token}`)
            .send({
              code: disableOtp,
            });
        }
      }
    } catch {
      /*
       * Cleanup must never hide the actual test result.
       */
    }

    try {
      /*
       * Delete the isolated test client after the suite.
       */
      if (testClientId && adminAccessToken) {
        await request(baseUrl)
          .delete(`/api/admin/clients/${encodeURIComponent(testClientId)}`)
          .set('Authorization', `Bearer ${adminAccessToken}`);
      }
    } catch {
      /*
       * Cleanup must never hide the actual test result.
       */
    }
  });

  // ------------------------------------------------------------
  // Recovery-code regeneration
  // ------------------------------------------------------------

  it('invalidates old recovery codes after regeneration', async () => {
    expect(recoveryCodes).toHaveLength(10);

    const oldRecoveryCode = recoveryCodes[2];

    /*
     * Authenticate using the existing TOTP MFA flow.
     */
    const { agent, interactionUid, codeVerifier } = await startMfaLogin();

    const otp = generateTotp(mfaSecret!);

    const tokenSet = await completeMfaLogin(
      agent,
      interactionUid,
      codeVerifier,
      otp,
    );

    expect(tokenSet.access_token).toBeTruthy();

    /*
     * Regenerate recovery codes using the current TOTP.
     */
    const regenerateOtp = generateTotp(mfaSecret!);

    const regenerate = await request(baseUrl)
      .post('/api/mfa/recovery-codes/regenerate')
      .set('Authorization', `Bearer ${tokenSet.access_token}`)
      .send({
        code: regenerateOtp,
      });

    expect(regenerate.status).toBe(201);

    expect(regenerate.body.recoveryCodes).toBeDefined();

    expect(Array.isArray(regenerate.body.recoveryCodes)).toBe(true);

    expect(regenerate.body.recoveryCodes).toHaveLength(10);

    const newRecoveryCodes = regenerate.body.recoveryCodes as string[];

    expect(newRecoveryCodes).not.toContain(oldRecoveryCode);

    expect(newRecoveryCodes).not.toEqual(recoveryCodes);

    /*
     * Keep the new set for the remaining tests.
     */
    recoveryCodes = newRecoveryCodes;

    /*
     * An old recovery code must no longer authenticate.
     */
    const oldCodeLogin = await startMfaLogin();

    const oldCodeResponse = await oldCodeLogin.agent
      .post(`/interaction/${oldCodeLogin.interactionUid}/mfa`)
      .send({
        method: 'recovery',
        code: oldRecoveryCode,
      })
      .redirects(0);

    expect(oldCodeResponse.status).toBe(401);

    expect(oldCodeResponse.text.toLowerCase()).toContain('invalid mfa');

    expect(oldCodeResponse.headers.location).toBeUndefined();

    /*
     * A newly generated recovery code must authenticate.
     *
     * Use [9] so that [0] and [1] remain available
     * for the following recovery-code tests.
     */
    const newCodeLogin = await startMfaLogin();

    const newTokenSet = await completeRecoveryCodeLogin(
      newCodeLogin.agent,
      newCodeLogin.interactionUid,
      newCodeLogin.codeVerifier,
      newRecoveryCodes[9],
    );

    expect(newTokenSet.access_token).toBeTruthy();

    expect(newTokenSet.id_token).toBeTruthy();
  });

  // ------------------------------------------------------------
  // Test 1
  // ------------------------------------------------------------

  it('does not issue an authorization code when MFA verification fails', async () => {
    const { agent, interactionUid } = await startMfaLogin();

    const response = await agent
      .post(`/interaction/${interactionUid}/mfa`)
      .send({
        method: 'totp',
        code: '000000',
      })
      .redirects(0);

    expect(response.status).toBe(401);

    expect(response.text.toLowerCase()).toContain('invalid mfa');

    /*
     * A failed MFA attempt must not redirect
     * to an authorization code.
     */
    expect(response.headers.location).toBeUndefined();
  });

  // ------------------------------------------------------------
  // Test 2
  // ------------------------------------------------------------

  it('completes OIDC authentication with a recovery code', async () => {
    expect(recoveryCodes).toHaveLength(10);

    const recoveryCode = recoveryCodes[0];

    const { agent, interactionUid, codeVerifier } = await startMfaLogin();

    const tokenSet = await completeRecoveryCodeLogin(
      agent,
      interactionUid,
      codeVerifier,
      recoveryCode,
    );

    expect(tokenSet.access_token).toBeTruthy();

    expect(tokenSet.id_token).toBeTruthy();

    /*
     * Recovery-code authentication is still MFA
     * authentication, so the ID token must contain
     * both password and OTP AMR values.
     */
    const parts = tokenSet.id_token.split('.');

    expect(parts).toHaveLength(3);

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as {
      amr?: string[];
    };

    expect(payload.amr).toEqual(['pwd', 'otp']);
  });

  // ------------------------------------------------------------
  // Test 3
  // ------------------------------------------------------------

  it('rejects reuse of an already consumed recovery code', async () => {
    expect(recoveryCodes).toHaveLength(10);

    const recoveryCode = recoveryCodes[0];

    const { agent, interactionUid } = await startMfaLogin();

    const response = await agent
      .post(`/interaction/${interactionUid}/mfa`)
      .send({
        method: 'recovery',
        code: recoveryCode,
      })
      .redirects(0);

    expect(response.status).toBe(401);

    expect(response.text.toLowerCase()).toContain('invalid mfa');

    expect(response.headers.location).toBeUndefined();
  });

  // ------------------------------------------------------------
  // Test 4
  // ------------------------------------------------------------

  it('allows another unused recovery code to authenticate', async () => {
    expect(recoveryCodes).toHaveLength(10);

    const recoveryCode = recoveryCodes[1];

    const { agent, interactionUid, codeVerifier } = await startMfaLogin();

    const tokenSet = await completeRecoveryCodeLogin(
      agent,
      interactionUid,
      codeVerifier,
      recoveryCode,
    );

    expect(tokenSet.access_token).toBeTruthy();

    expect(tokenSet.id_token).toBeTruthy();
  });

  // ------------------------------------------------------------
  // Test 5
  // ------------------------------------------------------------

  it('completes OIDC authentication with valid TOTP', async () => {
    expect(mfaSecret).toBeDefined();

    const { agent, interactionUid, codeVerifier } = await startMfaLogin();

    const otp = generateTotp(mfaSecret!);

    expect(otp).toMatch(/^\d{6}$/);

    const tokenSet = await completeMfaLogin(
      agent,
      interactionUid,
      codeVerifier,
      otp,
    );

    expect(tokenSet.access_token).toBeTruthy();

    expect(tokenSet.id_token).toBeTruthy();

    /*
     * Inspect ID-token AMR.
     */
    const parts = tokenSet.id_token.split('.');

    expect(parts).toHaveLength(3);

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    ) as {
      amr?: string[];
    };

    expect(payload.amr).toEqual(['pwd', 'otp']);
  });
});
