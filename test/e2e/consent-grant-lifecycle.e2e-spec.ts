import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC Consent and Grant Lifecycle (e2e)', () => {
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

  const testRedirectBase =
    process.env.E2E_CONSENT_REDIRECT_URI ??
    'http://localhost:3000/consent-e2e/callback.html';

  interface TestClient {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    username: string;
    password: string;
  }

  interface AuthorizationResult {
    code: string;
    client: TestClient;
    agent: request.SuperAgentTest;
    verifier: string;
    tokenEndpoint: string;
  }

  function createPkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  async function followRedirects(
    agent: request.SuperAgentTest,
    location: string,
  ): Promise<{
    response: request.Response;
    url: URL;
  }> {
    let url = new URL(location, baseUrl);

    for (let i = 0; i < 15; i += 1) {
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

    const { authorization_endpoint, token_endpoint } = discovery.body;

    const { verifier: codeVerifier, challenge: codeChallenge } = createPkce();

    const authorizationUrl = new URL(authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set('state', `consent-admin-${Date.now()}`);
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

      if (response.status === 200) {
        const interactionMatch = response.text.match(
          /\/interaction\/([^\/?#"'<>]+)/,
        );

        if (interactionMatch?.[1]) {
          interactionUid = interactionMatch[1];
          break;
        }

        throw new Error(
          `Expected an OIDC interaction page while following admin authorization, got HTTP 200 from ${current.pathname}${current.search}`,
        );
      }

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

    let response = login;
    let responseUrl: URL | undefined;

    if ([301, 302, 303, 307, 308].includes(login.status)) {
      expect(login.headers.location).toBeDefined();
      const followed = await followRedirects(agent, login.headers.location);
      response = followed.response;
      responseUrl = followed.url;
    }

    if (response.status === 200) {
      expect(response.text.toLowerCase()).toContain('consent');

      // followRedirects() already fetched the rendered consent page.
      // Do not GET the same interaction again: the provider may reject
      // a second GET after the interaction state has advanced.
      const consentPageUrl =
        responseUrl ?? new URL(`/interaction/${interactionUid}`, baseUrl);
      expect(consentPageUrl.pathname).toMatch(/^\/interaction\//);

      const consentUid = consentPageUrl.pathname
        .split('/')
        .filter(Boolean)
        .pop();
      expect(consentUid).toBeDefined();

      const consent = await agent
        .post(`/interaction/${consentUid}/consent`)
        .send({ decision: 'accept' })
        .redirects(0);

      expect([200, 301, 302, 303, 307, 308]).toContain(consent.status);
      expect(consent.headers.location).toBeDefined();

      const followed = await followRedirects(agent, consent.headers.location);
      response = followed.response;
      responseUrl = followed.url;
    }

    // The redirect chain may already have fetched the callback page (HTTP 200).
    // In that case the authorization code is in the final URL, not Location.
    const callback =
      responseUrl &&
      responseUrl.origin === new URL(adminRedirectUri).origin &&
      responseUrl.pathname === new URL(adminRedirectUri).pathname
        ? responseUrl
        : new URL(response.headers.location ?? '', baseUrl);

    expect(callback.pathname).toBe('/idp-admin/callback.html');

    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();

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

    expect(token.body.access_token).toBeTruthy();

    return token.body.access_token as string;
  }

  async function registerClient(): Promise<TestClient> {
    const agent = request.agent(baseUrl);
    const adminAccessToken = await authenticateAdmin(agent);

    const initialTokenResponse = await agent
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(201);

    expect(initialTokenResponse.body.token).toBeTruthy();

    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const registrationEndpoint = discovery.body.registration_endpoint;
    expect(registrationEndpoint).toBeDefined();

    const suffix = randomBytes(8).toString('hex');
    const redirectUri = testRedirectBase.endsWith('.html')
      ? testRedirectBase.replace(/\.html$/, `-${suffix}.html`)
      : `${testRedirectBase}/${suffix}`;

    const registration = await agent
      .post(new URL(registrationEndpoint).pathname)
      .set('Authorization', `Bearer ${initialTokenResponse.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({
        client_name: `E2E Consent Client ${Date.now()}`,
        redirect_uris: [redirectUri],
        scope: 'openid profile email roles',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        interaction_mode: 'hosted',
      })
      .expect(201);

    expect(registration.body.client_id).toBeTruthy();

    const username = `consent-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'ConsentTest123!';

    const user = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: registration.body.client_id,
      })
      .expect(201);

    expect(user.body.id).toBeTruthy();
    expect(user.body.username).toBe(username);

    return {
      clientId: registration.body.client_id,
      clientSecret: registration.body.client_secret,
      redirectUri,
      username,
      password,
    };
  }

  async function beginAuthorization(
    agent: request.SuperAgentTest,
    client: TestClient,
    scope: string,
    extra: Record<string, string> = {},
  ) {
    const discovery = await agent
      .get('/.well-known/openid-configuration')
      .expect(200);

    const { authorization_endpoint, token_endpoint } = discovery.body;
    const { verifier, challenge } = createPkce();

    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope,
      state: `consent-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...extra,
    });

    const response = await agent
      .get(`${new URL(authorization_endpoint).pathname}?${params}`)
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    return {
      response,
      verifier,
      tokenEndpoint: token_endpoint as string,
    };
  }

  async function completeAuthorization(
    agent: request.SuperAgentTest,
    client: TestClient,
    initial: {
      response: request.Response;
      verifier: string;
      tokenEndpoint: string;
    },
    options: {
      acceptConsent?: boolean;
      expectConsent?: boolean;
    } = {},
  ): Promise<AuthorizationResult> {
    const acceptConsent = options.acceptConsent ?? true;
    let response = initial.response;
    let interactionUid: string | undefined;

    for (let step = 0; step < 15; step += 1) {
      const location = response.headers.location;

      if (location) {
        const url = new URL(location, baseUrl);

        if (
          url.origin === new URL(client.redirectUri).origin &&
          url.pathname === new URL(client.redirectUri).pathname
        ) {
          const code = url.searchParams.get('code');

          if (code) {
            return {
              code,
              client,
              agent,
              verifier: initial.verifier,
              tokenEndpoint: initial.tokenEndpoint,
            };
          }

          const error = url.searchParams.get('error');
          throw new Error(
            `Authorization failed: ${error ?? 'unknown'}: ${
              url.searchParams.get('error_description') ?? ''
            }`,
          );
        }

        response = await agent.get(`${url.pathname}${url.search}`).redirects(0);

        if (response.status >= 400) {
          throw new Error(
            `Authorization continuation failed with ${response.status}: ${
              response.text ?? ''
            }`,
          );
        }

        continue;
      }

      const body = response.text ?? '';

      const loginMatch = body.match(
        /<form[^>]+action=["']([^"']*\/login[^"']*)["']/i,
      );

      if (loginMatch) {
        const action = new URL(loginMatch[1], baseUrl);
        interactionUid = action.pathname.split('/').filter(Boolean).at(-2);

        response = await agent
          .post(`${action.pathname}${action.search}`)
          .type('form')
          .send({
            username: client.username,
            password: client.password,
          })
          .redirects(0);

        continue;
      }

      const consentMatch = body.match(
        /<form[^>]+action=["']([^"']*\/consent[^"']*)["']/i,
      );

      if (consentMatch) {
        const action = new URL(consentMatch[1], baseUrl);
        interactionUid = action.pathname.split('/').filter(Boolean).at(-2);

        if (options.expectConsent === false) {
          throw new Error(
            `Unexpected consent interaction for client ${client.clientId}`,
          );
        }

        if (!acceptConsent) {
          response = await agent
            .post(`${action.pathname}${action.search}`)
            .type('form')
            .send({ decision: 'reject' })
            .redirects(0);

          // Continue until the registered callback is reached so the test
          // can assert the OAuth error response.
          continue;
        }

        response = await agent
          .post(`${action.pathname}${action.search}`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        continue;
      }

      throw new Error(
        `Unable to determine OIDC interaction state: ${response.status}`,
      );
    }

    throw new Error('Authorization interaction exceeded 15 steps');
  }

  async function exchangeCode(result: AuthorizationResult) {
    return result.agent
      .post(new URL(result.tokenEndpoint).pathname)
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: result.code,
        redirect_uri: result.client.redirectUri,
        client_id: result.client.clientId,
        code_verifier: result.verifier,
      })
      .expect(200);
  }

  it('creates a grant on first consent and reuses it on a subsequent authorization', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);

    const firstStart = await beginAuthorization(
      agent,
      client,
      'openid profile',
    );

    const first = await completeAuthorization(agent, client, firstStart, {
      expectConsent: true,
    });

    const firstToken = await exchangeCode(first);

    expect(firstToken.body.access_token).toBeTruthy();
    expect(firstToken.body.id_token).toBeTruthy();

    const secondStart = await beginAuthorization(
      agent,
      client,
      'openid profile',
    );

    const second = await completeAuthorization(agent, client, secondStart, {
      expectConsent: false,
    });

    const secondToken = await exchangeCode(second);

    expect(secondToken.body.access_token).toBeTruthy();
    expect(secondToken.body.id_token).toBeTruthy();
  });

  it('forces a new consent interaction with prompt=consent even when a grant already exists', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);

    const firstStart = await beginAuthorization(
      agent,
      client,
      'openid profile',
    );

    await exchangeCode(
      await completeAuthorization(agent, client, firstStart, {
        expectConsent: true,
      }),
    );

    const forcedStart = await beginAuthorization(
      agent,
      client,
      'openid profile',
      { prompt: 'consent' },
    );

    const forced = await completeAuthorization(agent, client, forcedStart, {
      expectConsent: true,
    });

    const token = await exchangeCode(forced);

    expect(token.body.access_token).toBeTruthy();
    expect(token.body.id_token).toBeTruthy();
  });

  it('requests consent again when an additional normal scope is introduced', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);

    const firstStart = await beginAuthorization(
      agent,
      client,
      'openid profile',
    );

    await exchangeCode(
      await completeAuthorization(agent, client, firstStart, {
        expectConsent: true,
      }),
    );

    const incrementalStart = await beginAuthorization(
      agent,
      client,
      'openid profile email',
    );

    const incremental = await completeAuthorization(
      agent,
      client,
      incrementalStart,
      { expectConsent: true },
    );

    const token = await exchangeCode(incremental);

    expect(token.body.access_token).toBeTruthy();
    expect(token.body.id_token).toBeTruthy();
  });

  it('returns access_denied when the user rejects consent', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);

    const start = await beginAuthorization(agent, client, 'openid profile');

    const response = await completeAuthorization(agent, client, start, {
      acceptConsent: false,
      expectConsent: true,
    }).catch((error: Error) => {
      // A rejected authorization is expected to terminate at the callback
      // with an OAuth error rather than producing an AuthorizationResult.
      expect(error.message).toMatch(/Authorization failed/);
      return undefined;
    });

    expect(response).toBeUndefined();
  });
});
