import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC interaction state and security (e2e)', () => {
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
    'http://localhost:3000/interaction-security/callback.html';

  interface TestClient {
    clientId: string;
    redirectUri: string;
    username: string;
    password: string;
  }

  interface FormAction {
    path: string;
    uid: string;
  }

  function createPkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function isRedirect(status: number) {
    return [301, 302, 303, 307, 308].includes(status);
  }

  function expectNoAuthorizationSuccess(
    response: request.Response,
    redirectUri: string,
  ) {
    if (!isRedirect(response.status) || !response.headers.location) return;
    const target = new URL(response.headers.location, baseUrl);
    if (
      target.origin === new URL(redirectUri).origin &&
      target.pathname === new URL(redirectUri).pathname
    ) {
      expect(target.searchParams.get('code')).toBeNull();
    }
  }

  async function followRedirects(
    agent: request.SuperAgentTest,
    location: string,
  ): Promise<{ response: request.Response; url: URL }> {
    let url = new URL(location, baseUrl);
    for (let i = 0; i < 15; i += 1) {
      const response = await agent
        .get(`${url.pathname}${url.search}`)
        .redirects(0);
      if (!isRedirect(response.status)) return { response, url };
      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }
      url = new URL(response.headers.location, url);
    }
    throw new Error('Too many redirects while processing OIDC flow');
  }

  async function authenticateAdmin(agent: request.SuperAgentTest) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { authorization_endpoint, token_endpoint } = discovery.body;
    const { verifier, challenge } = createPkce();
    const authorizationUrl = new URL(authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', adminClientId);
    authorizationUrl.searchParams.set('redirect_uri', adminRedirectUri);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid profile email');
    authorizationUrl.searchParams.set('state', `interaction-admin-${Date.now()}`);
    authorizationUrl.searchParams.set('code_challenge', challenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');

    const start = await agent
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .redirects(0);
    expect(isRedirect(start.status)).toBe(true);
    expect(start.headers.location).toBeDefined();

    let current = new URL(start.headers.location, baseUrl);
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
        interactionUid = response.text.match(/\/interaction\/([^\/?#"'<>]+)/)?.[1];
        if (!interactionUid) throw new Error('Could not find admin interaction UID');
        break;
      }
      expect(isRedirect(response.status)).toBe(true);
      expect(response.headers.location).toBeDefined();
      current = new URL(response.headers.location, baseUrl);
    }
    expect(interactionUid).toBeDefined();

    const interactionPage = await agent.get(`/interaction/${interactionUid}`).expect(200);
    const loginAction = findAction(interactionPage.text, 'login');
    const login = await agent
      .post(loginAction.path)
      .type('form')
      .send({ username: adminUsername, password: adminPassword })
      .redirects(0);
    expect([200, 301, 302, 303, 307, 308]).toContain(login.status);

    let response = login;
    let responseUrl: URL | undefined;
    if (isRedirect(login.status)) {
      expect(login.headers.location).toBeDefined();
      const followed = await followRedirects(agent, login.headers.location);
      response = followed.response;
      responseUrl = followed.url;
    }
    if (response.status === 200) {
      const page = response.text;
      expect(page.toLowerCase()).toContain('consent');
      const consentUid = (responseUrl?.pathname ?? `/interaction/${interactionUid}`)
        .split('/')
        .filter(Boolean)
        .pop()!;
      const consent = await agent
        .post(`/interaction/${consentUid}/consent`)
        .type('form')
        .send({ decision: 'accept' })
        .redirects(0);
      expect(isRedirect(consent.status)).toBe(true);
      expect(consent.headers.location).toBeDefined();
      const followed = await followRedirects(agent, consent.headers.location);
      response = followed.response;
      responseUrl = followed.url;
    }

    const callback = responseUrl &&
      responseUrl.origin === new URL(adminRedirectUri).origin &&
      responseUrl.pathname === new URL(adminRedirectUri).pathname
      ? responseUrl
      : new URL(response.headers.location ?? '', baseUrl);
    expect(callback.pathname).toBe(new URL(adminRedirectUri).pathname);
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
        code_verifier: verifier,
      })
      .expect(200);
    return token.body.access_token as string;
  }

  function findAction(html: string, endpoint: 'login' | 'consent'): FormAction {
    const match = html.match(
      new RegExp(`<form[^>]+action=["']([^"']*\\/${endpoint}[^"']*)["']`, 'i'),
    );
    if (!match?.[1]) throw new Error(`Could not find ${endpoint} form action`);
    const url = new URL(match[1], baseUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return { path: `${url.pathname}${url.search}`, uid: parts.at(-2)! };
  }

  async function registerClient(): Promise<TestClient> {
    const agent = request.agent(baseUrl);
    const adminAccessToken = await authenticateAdmin(agent);
    const initialToken = await agent
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(201);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const suffix = randomBytes(8).toString('hex');
    const redirectUri = testRedirectBase.endsWith('.html')
      ? testRedirectBase.replace(/\.html$/, `-${suffix}.html`)
      : `${testRedirectBase}/${suffix}`;
    const registration = await agent
      .post(new URL(discovery.body.registration_endpoint).pathname)
      .set('Authorization', `Bearer ${initialToken.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({
        client_name: `E2E Interaction Security ${Date.now()}`,
        redirect_uris: [redirectUri],
        scope: 'openid profile email roles',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        interaction_mode: 'hosted',
      })
      .expect(201);
    const username = `interaction-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'InteractionTest123!';
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
    return {
      clientId: registration.body.client_id,
      redirectUri,
      username,
      password,
    };
  }

  async function startInteraction(agent: request.SuperAgentTest, client: TestClient) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { challenge } = createPkce();
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: `interaction-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const response = await agent
      .get(`${new URL(discovery.body.authorization_endpoint).pathname}?${params}`)
      .redirects(0);
    expect(isRedirect(response.status)).toBe(true);
    expect(response.headers.location).toBeDefined();
    const page = await followRedirects(agent, response.headers.location);
    expect(page.response.status).toBe(200);
    expect(page.url.pathname).toMatch(/^\/interaction\//);
    return { page: page.response, url: page.url };
  }

  it('rejects a fabricated interaction UID on read, login, and consent endpoints', async () => {
    const agent = request.agent(baseUrl);
    const uid = `missing-${randomBytes(16).toString('hex')}`;
    const responses = await Promise.all([
      agent.get(`/interaction/${uid}`).redirects(0),
      agent.post(`/interaction/${uid}/login`).send({ username: 'x', password: 'x' }).redirects(0),
      agent.post(`/interaction/${uid}/consent`).send({ decision: 'accept' }).redirects(0),
    ]);
    for (const response of responses) expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it.each([
    ['missing username', { password: 'anything' }],
    ['missing password', { username: 'anything' }],
    ['empty fields', { username: '', password: '' }],
    ['malformed field types', { username: ['unexpected'], password: { value: 'unexpected' } }],
  ])('does not authenticate with %s', async (_label, credentials) => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);
    const { page } = await startInteraction(agent, client);
    const action = findAction(page.text, 'login');
    expect(action.uid).toBeTruthy();
    const response = await agent
      .post(action.path)
      .type('form')
      .send(credentials)
      .redirects(0);
    expectNoAuthorizationSuccess(response, client.redirectUri);
  });

  it('does not accept a consent submission before authentication', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);
    const { page } = await startInteraction(agent, client);
    const loginAction = findAction(page.text, 'login');
    const response = await agent
      .post(`/interaction/${loginAction.uid}/consent`)
      .type('form')
      .send({ decision: 'accept' })
      .redirects(0);
    expectNoAuthorizationSuccess(response, client.redirectUri);
  });

  it.each([
    ['missing decision', {}],
    ['unknown decision', { decision: 'maybe' }],
  ])('rejects consent with %s', async (_label, decision) => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);
    const { page } = await startInteraction(agent, client);
    const loginAction = findAction(page.text, 'login');
    const login = await agent
      .post(loginAction.path)
      .type('form')
      .send({ username: client.username, password: client.password })
      .redirects(0);
    expect(isRedirect(login.status)).toBe(true);
    expect(login.headers.location).toBeDefined();
    const consentPage = await followRedirects(agent, login.headers.location);
    expect(consentPage.response.status).toBe(200);
    const consentAction = findAction(consentPage.response.text, 'consent');
    const response = await agent
      .post(consentAction.path)
      .type('form')
      .send(decision)
      .redirects(0);
    expectNoAuthorizationSuccess(response, client.redirectUri);
  });

  it('does not complete authorization when consent is rejected, and cannot reuse its interaction', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);
    const { page } = await startInteraction(agent, client);
    const loginAction = findAction(page.text, 'login');
    const login = await agent
      .post(loginAction.path)
      .type('form')
      .send({ username: client.username, password: client.password })
      .redirects(0);
    expect(isRedirect(login.status)).toBe(true);
    expect(login.headers.location).toBeDefined();
    const consentPage = await followRedirects(agent, login.headers.location);
    expect(consentPage.response.status).toBe(200);
    const consentAction = findAction(consentPage.response.text, 'consent');
    const rejected = await agent
      .post(consentAction.path)
      .type('form')
      .send({ decision: 'reject' })
      .redirects(0);
    expect(isRedirect(rejected.status)).toBe(true);
    expect(rejected.headers.location).toBeDefined();
    const callback = await followRedirects(agent, rejected.headers.location);
    expect(callback.url.origin).toBe(new URL(client.redirectUri).origin);
    expect(callback.url.pathname).toBe(new URL(client.redirectUri).pathname);
    expect(callback.url.searchParams.get('error')).toBe('access_denied');

    const completedRead = await agent.get(`/interaction/${consentAction.uid}`).redirects(0);
    expect(completedRead.status).toBeGreaterThanOrEqual(400);

    const replay = await agent
      .post(consentAction.path)
      .type('form')
      .send({ decision: 'accept' })
      .redirects(0);
    expectNoAuthorizationSuccess(replay, client.redirectUri);
  });

  it('does not allow login submission to succeed twice for the same interaction', async () => {
    const client = await registerClient();
    const agent = request.agent(baseUrl);
    const { page } = await startInteraction(agent, client);
    const loginAction = findAction(page.text, 'login');
    const payload = { username: client.username, password: client.password };
    const first = await agent
      .post(loginAction.path)
      .type('form')
      .send(payload)
      .redirects(0);
    expect(isRedirect(first.status)).toBe(true);
    const replay = await agent
      .post(loginAction.path)
      .type('form')
      .send(payload)
      .redirects(0);
    expectNoAuthorizationSuccess(replay, client.redirectUri);
  });
});
