import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC external interaction URL routing (e2e)', () => {
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
  const appRedirectBase =
    process.env.E2E_EXTERNAL_REDIRECT_URI ??
    'http://localhost:3000/external-interaction/callback.html';

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function isRedirect(status: number) {
    return [301, 302, 303, 307, 308].includes(status);
  }

  async function followLocalRedirects(
    agent: request.SuperAgentTest,
    location: string,
  ) {
    let url = new URL(location, baseUrl);
    for (let i = 0; i < 15; i += 1) {
      if (url.origin !== new URL(baseUrl).origin) return { response: undefined, url };
      const response = await agent
        .get(`${url.pathname}${url.search}`)
        .redirects(0);
      if (!isRedirect(response.status)) return { response, url };
      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }
      url = new URL(response.headers.location, url);
    }
    throw new Error('Too many redirects while processing OIDC interaction');
  }

  async function authenticateAdmin(agent: request.SuperAgentTest) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { verifier, challenge } = pkce();
    const url = new URL(discovery.body.authorization_endpoint);
    url.searchParams.set('client_id', adminClientId);
    url.searchParams.set('redirect_uri', adminRedirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', `external-admin-${randomBytes(6).toString('hex')}`);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    const start = await agent
      .get(`${url.pathname}${url.search}`)
      .redirects(0);
    expect(isRedirect(start.status)).toBe(true);
    expect(start.headers.location).toBeDefined();

    let current = new URL(start.headers.location, baseUrl);
    let uid: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      if (current.pathname.startsWith('/interaction/')) {
        uid = current.pathname.split('/').filter(Boolean).pop();
        break;
      }
      const next = await agent
        .get(`${current.pathname}${current.search}`)
        .redirects(0);
      if (next.status === 200) {
        uid = next.text.match(/\/interaction\/([^\/?#"'<>]+)/)?.[1];
        if (!uid) throw new Error('Could not locate admin interaction UID');
        break;
      }
      expect(isRedirect(next.status)).toBe(true);
      expect(next.headers.location).toBeDefined();
      current = new URL(next.headers.location, baseUrl);
    }
    expect(uid).toBeDefined();

    const loginPage = await agent.get(`/interaction/${uid}`).expect(200);
    const loginAction = loginPage.text.match(
      /<form[^>]+action=["']([^"']*\/login[^"']*)["']/i,
    )?.[1];
    expect(loginAction).toBeDefined();
    const loginUrl = new URL(loginAction!, baseUrl);
    const login = await agent
      .post(`${loginUrl.pathname}${loginUrl.search}`)
      .type('form')
      .send({ username: adminUsername, password: adminPassword })
      .redirects(0);
    expect(isRedirect(login.status)).toBe(true);
    expect(login.headers.location).toBeDefined();

    let afterLogin = await followLocalRedirects(agent, login.headers.location);
    if (afterLogin.response?.status === 200 && /consent/i.test(afterLogin.response.text)) {
      const action = afterLogin.response.text.match(
        /<form[^>]+action=["']([^"']*\/consent[^"']*)["']/i,
      )?.[1];
      expect(action).toBeDefined();
      const consentUrl = new URL(action!, baseUrl);
      const consent = await agent
        .post(`${consentUrl.pathname}${consentUrl.search}`)
        .type('form')
        .send({ decision: 'accept' })
        .redirects(0);
      expect(isRedirect(consent.status)).toBe(true);
      expect(consent.headers.location).toBeDefined();
      afterLogin = await followLocalRedirects(agent, consent.headers.location);
    }

    const callback = afterLogin.url.origin === new URL(adminRedirectUri).origin &&
      afterLogin.url.pathname === new URL(adminRedirectUri).pathname
      ? afterLogin.url
      : new URL(afterLogin.response?.headers.location ?? '', baseUrl);
    expect(callback.pathname).toBe(new URL(adminRedirectUri).pathname);
    const code = callback.searchParams.get('code');
    expect(code).toBeTruthy();
    const token = await agent
      .post(new URL(discovery.body.token_endpoint).pathname)
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

  async function registerClient(
    agent: request.SuperAgentTest,
    adminToken: string,
    options: { name: string; loginUrl?: string; consentUrl?: string },
  ) {
    const initialToken = await agent
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const suffix = randomBytes(8).toString('hex');
    const redirectUri = appRedirectBase.endsWith('.html')
      ? appRedirectBase.replace(/\.html$/, `-${suffix}.html`)
      : `${appRedirectBase}/${suffix}`;
    const body: Record<string, unknown> = {
      client_name: options.name,
      redirect_uris: [redirectUri],
      scope: 'openid profile email',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      interaction_mode: 'external',
    };
    if (options.loginUrl) body.interaction_login_url = options.loginUrl;
    if (options.consentUrl) body.interaction_consent_url = options.consentUrl;

    const registration = await agent
      .post(new URL(discovery.body.registration_endpoint).pathname)
      .set('Authorization', `Bearer ${initialToken.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(201);
    const username = `external-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'ExternalTest123!';
    const user = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: registration.body.client_id,
      })
      .expect(201);
    expect(user.body.id).toBeTruthy();
    return {
      clientId: registration.body.client_id as string,
      redirectUri,
      username,
      password,
    };
  }

  async function startInteraction(
    agent: request.SuperAgentTest,
    client: { clientId: string; redirectUri: string },
  ) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { challenge } = pkce();
    const params = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: client.redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: `external-${randomBytes(6).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const response = await agent
      .get(`${new URL(discovery.body.authorization_endpoint).pathname}?${params}`)
      .redirects(0);
    expect(isRedirect(response.status)).toBe(true);
    expect(response.headers.location).toBeDefined();
    const interaction = new URL(response.headers.location, baseUrl);
    expect(interaction.pathname).toMatch(/^\/interaction\//);
    return interaction;
  }

  it('redirects login interactions to the registered external login URL with context', async () => {
    const agent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(agent);
    const externalLogin = 'https://login.example.test/sign-in?theme=dark';
    const client = await registerClient(agent, adminToken, {
      name: `External login ${Date.now()}`,
      loginUrl: externalLogin,
      consentUrl: 'https://login.example.test/consent',
    });
    const interaction = await startInteraction(agent, client);
    const page = await agent.get(interaction.pathname).redirects(0);

    expect(isRedirect(page.status)).toBe(true);
    expect(page.headers.location).toBeDefined();
    const external = new URL(page.headers.location);
    expect(external.origin).toBe(new URL(externalLogin).origin);
    expect(external.pathname).toBe(new URL(externalLogin).pathname);
    expect(external.searchParams.get('theme')).toBe('dark');
    expect(external.searchParams.get('interaction_uid')).toBe(
      interaction.pathname.split('/').filter(Boolean).pop(),
    );
    expect(external.searchParams.get('prompt')).toBe('login');
    expect(external.searchParams.get('client_id')).toBe(client.clientId);
  });

  it('falls back to the hosted login page when external login URL is omitted', async () => {
    const agent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(agent);
    const client = await registerClient(agent, adminToken, {
      name: `External login fallback ${Date.now()}`,
      consentUrl: 'https://login.example.test/consent',
    });
    const interaction = await startInteraction(agent, client);
    const page = await agent.get(interaction.pathname).expect(200);

    expect(page.text).toMatch(/<form[^>]+action=["'][^"']*\/login/i);
  });

  it('redirects consent to its configured external URL after hosted login', async () => {
    const agent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(agent);
    const externalConsent = 'https://login.example.test/approve?view=compact';
    const client = await registerClient(agent, adminToken, {
      name: `External consent ${Date.now()}`,
      consentUrl: externalConsent,
    });
    const interaction = await startInteraction(agent, client);
    const loginPage = await agent.get(interaction.pathname).expect(200);
    const loginAction = loginPage.text.match(
      /<form[^>]+action=["']([^"']*\/login[^"']*)["']/i,
    )?.[1];
    expect(loginAction).toBeDefined();
    const loginUrl = new URL(loginAction!, baseUrl);
    const login = await agent
      .post(`${loginUrl.pathname}${loginUrl.search}`)
      .type('form')
      .send({ username: client.username, password: client.password })
      .redirects(0);
    expect(isRedirect(login.status)).toBe(true);
    expect(login.headers.location).toBeDefined();

    const continuation = await followLocalRedirects(agent, login.headers.location);
    expect(continuation.url.origin).toBe(new URL(externalConsent).origin);
    expect(continuation.url.pathname).toBe(new URL(externalConsent).pathname);
    expect(continuation.url.searchParams.get('view')).toBe('compact');
    expect(continuation.url.searchParams.get('prompt')).toBe('consent');
    expect(continuation.url.searchParams.get('client_id')).toBe(client.clientId);
    expect(continuation.url.searchParams.get('interaction_uid')).toBeTruthy();
  });

  it('falls back to the hosted consent page when external consent URL is omitted', async () => {
    const agent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(agent);
    const client = await registerClient(agent, adminToken, {
      name: `External consent fallback ${Date.now()}`,
    });
    const interaction = await startInteraction(agent, client);
    const loginPage = await agent.get(interaction.pathname).expect(200);
    const loginAction = loginPage.text.match(
      /<form[^>]+action=["']([^"']*\/login[^"']*)["']/i,
    )?.[1];
    expect(loginAction).toBeDefined();
    const loginUrl = new URL(loginAction!, baseUrl);
    const login = await agent
      .post(`${loginUrl.pathname}${loginUrl.search}`)
      .type('form')
      .send({ username: client.username, password: client.password })
      .redirects(0);
    expect(isRedirect(login.status)).toBe(true);
    expect(login.headers.location).toBeDefined();

    const consent = await followLocalRedirects(agent, login.headers.location);
    expect(consent.response?.status).toBe(200);
    expect(consent.url.pathname).toMatch(/^\/interaction\//);
    expect(consent.response?.text).toMatch(/<form[^>]+action=["'][^"']*\/consent/i);
  });
});
