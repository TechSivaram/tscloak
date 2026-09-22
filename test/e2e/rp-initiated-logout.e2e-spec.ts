import * as crypto from 'node:crypto';
import request from 'supertest';

describe('RP-Initiated Logout E2E', () => {
  const baseUrl = 'http://localhost:3000';

  // These values match the currently hosted Admin UI configuration.
  const adminClientId = '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const adminRedirectUri = `${baseUrl}/idp-admin/callback.html`;
  const registeredPostLogoutRedirectUri = `${baseUrl}/idp-admin/`;

  // Keep credentials configurable so the test does not require source changes
  // when the seeded administrator credentials differ between environments.
  const adminUsername = process.env.OIDC_E2E_ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.OIDC_E2E_ADMIN_PASSWORD ?? 'Password123!';

  function createPkce() {
    const codeVerifier = crypto.randomBytes(48).toString('base64url');

    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
    };
  }

  async function completeInteraction(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ): Promise<string> {
    let currentLocation = location;

    for (let attempt = 0; attempt < 12; attempt++) {
      // The final authorization response is a redirect to the RP callback.
      // The callback is owned by the client, not by the IdP, so do not GET it
      // and expect another OIDC interaction page.
      const currentUrl = new URL(currentLocation, baseUrl);
      if (currentUrl.pathname === new URL(adminRedirectUri).pathname) {
        if (
          currentUrl.searchParams.has('code') ||
          currentUrl.searchParams.has('error')
        ) {
          return currentUrl.pathname + currentUrl.search;
        }
      }

      const page = await agent.get(currentLocation).redirects(0);

      if (page.status === 400) {
        throw new Error(
          `OIDC authorization returned 400 for ${currentLocation}: ${page.text}`,
        );
      }

      if ([301, 302, 303, 307, 308].includes(page.status)) {
        const nextLocation = page.headers.location;

        if (!nextLocation) {
          throw new Error(
            `Redirect response did not contain Location: ${page.status}`,
          );
        }

        currentLocation = nextLocation.startsWith('http')
          ? new URL(nextLocation).pathname + new URL(nextLocation).search
          : nextLocation;

        continue;
      }

      if (page.status !== 200) {
        throw new Error(
          `Unexpected interaction response ${page.status}: ${page.text}`,
        );
      }

      const html = page.text;

      if (html.includes('action="/interaction/') && html.includes('/login"')) {
        const match = html.match(/action="\/interaction\/([^/]+)\/login"/);

        if (!match) {
          throw new Error('Could not extract login interaction UID');
        }

        const uid = decodeURIComponent(match[1]);

        const login = await agent
          .post(`/interaction/${uid}/login`)
          .type('form')
          .send({
            username: adminUsername,
            password: adminPassword,
          })
          .redirects(0);

        if (![301, 302, 303, 307, 308].includes(login.status)) {
          throw new Error(
            `Admin login failed: ${login.status} ${login.text.slice(0, 2000)}`,
          );
        }

        const nextLocation = login.headers.location;

        if (!nextLocation) {
          throw new Error('Admin login response did not contain Location');
        }

        currentLocation = nextLocation.startsWith('http')
          ? new URL(nextLocation).pathname + new URL(nextLocation).search
          : nextLocation;

        continue;
      }

      if (
        html.includes('action="/interaction/') &&
        html.includes('/consent"')
      ) {
        const match = html.match(/action="\/interaction\/([^/]+)\/consent"/);

        if (!match) {
          throw new Error('Could not extract consent interaction UID');
        }

        const uid = decodeURIComponent(match[1]);

        const consent = await agent
          .post(`/interaction/${uid}/consent`)
          .type('form')
          .send({
            decision: 'accept',
          })
          .redirects(0);

        if (![301, 302, 303, 307, 308].includes(consent.status)) {
          throw new Error(
            `Admin consent failed: ${consent.status} ${consent.text.slice(0, 2000)}`,
          );
        }

        const nextLocation = consent.headers.location;

        if (!nextLocation) {
          throw new Error('Admin consent response did not contain Location');
        }

        currentLocation = nextLocation.startsWith('http')
          ? new URL(nextLocation).pathname + new URL(nextLocation).search
          : nextLocation;

        continue;
      }

      throw new Error(
        `Unexpected 200 OIDC page at ${currentLocation}. ` +
          `Expected a login or consent form. HTML: ${html.slice(0, 3000)}`,
      );
    }

    throw new Error(
      `OIDC interaction did not complete within 12 steps. Last URL: ${currentLocation}`,
    );
  }

  async function obtainAdminIdToken(): Promise<string> {
    const agent = request.agent(baseUrl);
    const { codeVerifier, codeChallenge } = createPkce();

    const authorizationUrl = new URL('/auth', baseUrl);

    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set('prompt', 'consent');
    authorizationUrl.searchParams.set(
      'state',
      crypto.randomBytes(16).toString('hex'),
    );
    authorizationUrl.searchParams.set(
      'nonce',
      crypto.randomBytes(16).toString('hex'),
    );
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const finalLocation = await completeInteraction(
      agent,
      authorizationUrl.pathname + authorizationUrl.search,
    );

    const callbackUrl = new URL(finalLocation, baseUrl);

    const code = callbackUrl.searchParams.get('code');

    if (!code) {
      const error = callbackUrl.searchParams.get('error');

      throw new Error(
        `Authorization did not return a code. error=${error ?? 'unknown'} location=${finalLocation}`,
      );
    }

    const tokenResponse = await agent.post('/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: adminClientId,
      redirect_uri: adminRedirectUri,
      code,
      code_verifier: codeVerifier,
    });

    if (tokenResponse.status !== 200) {
      throw new Error(
        `Admin token exchange failed: ${tokenResponse.status} ${tokenResponse.text}`,
      );
    }

    expect(tokenResponse.body).toHaveProperty('id_token');

    return tokenResponse.body.id_token;
  }

  it('should advertise the RP-initiated logout endpoint', async () => {
    const discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    expect(discovery.body).toHaveProperty('end_session_endpoint');

    expect(discovery.body.end_session_endpoint).toBe(`${baseUrl}/session/end`);
  });

  it('should reject an unregistered post_logout_redirect_uri', async () => {
    const idToken = await obtainAdminIdToken();

    const logoutUrl = new URL('/session/end', baseUrl);

    logoutUrl.searchParams.set('id_token_hint', idToken);
    logoutUrl.searchParams.set('client_id', adminClientId);
    logoutUrl.searchParams.set(
      'post_logout_redirect_uri',
      `${baseUrl}/not-registered`,
    );

    const response = await request(baseUrl)
      .get(logoutUrl.pathname + logoutUrl.search)
      .redirects(0);

    expect([400, 403]).toContain(response.status);
  });

  it('should accept a registered post_logout_redirect_uri with an id_token_hint', async () => {
    const idToken = await obtainAdminIdToken();

    const logoutUrl = new URL('/session/end', baseUrl);

    logoutUrl.searchParams.set('id_token_hint', idToken);
    logoutUrl.searchParams.set('client_id', adminClientId);
    logoutUrl.searchParams.set(
      'post_logout_redirect_uri',
      registeredPostLogoutRedirectUri,
    );

    const response = await request(baseUrl)
      .get(logoutUrl.pathname + logoutUrl.search)
      .redirects(0);

    expect([200, 301, 302, 303, 307, 308]).toContain(response.status);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      expect(response.headers.location).toBe(registeredPostLogoutRedirectUri);
    }
  });
});
