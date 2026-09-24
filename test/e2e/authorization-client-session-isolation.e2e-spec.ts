import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC client session isolation (e2e)', () => {
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
  const testRedirectUri =
    process.env.E2E_SESSION_REDIRECT_URI ??
    'http://localhost:3000/session-isolation/callback.html';

  function createPkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function formAction(html: string, name: 'login' | 'consent') {
    const match = html.match(
      new RegExp(`<form[^>]+action=["']([^"']*\\/${name}[^"']*)["']`, 'i'),
    );
    if (!match?.[1]) throw new Error(`Could not find ${name} form action`);
    const url = new URL(match[1], baseUrl);
    return `${url.pathname}${url.search}`;
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
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return { response, url };
      }
      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }
      url = new URL(response.headers.location, url);
    }
    throw new Error('Too many redirects while following authorization');
  }

  async function authenticateAdmin(agent: request.SuperAgentTest) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { verifier, challenge } = createPkce();
    const authorization = new URL(discovery.body.authorization_endpoint);
    authorization.searchParams.set('client_id', adminClientId);
    authorization.searchParams.set('redirect_uri', adminRedirectUri);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('scope', 'openid profile email');
    authorization.searchParams.set('state', `session-admin-${randomBytes(6).toString('hex')}`);
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 'S256');

    const start = await agent
      .get(`${authorization.pathname}${authorization.search}`)
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(start.status);
    expect(start.headers.location).toBeDefined();

    let current = new URL(start.headers.location, baseUrl);
    let interactionUid: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      if (current.pathname.startsWith('/interaction/')) {
        interactionUid = current.pathname.split('/').filter(Boolean).pop();
        break;
      }
      const next = await agent
        .get(`${current.pathname}${current.search}`)
        .redirects(0);
      if (next.status === 200) {
        interactionUid = next.text.match(/\/interaction\/([^\/?#"'<>]+)/)?.[1];
        if (!interactionUid) throw new Error('Could not determine admin interaction UID');
        break;
      }
      expect([301, 302, 303, 307, 308]).toContain(next.status);
      expect(next.headers.location).toBeDefined();
      current = new URL(next.headers.location, baseUrl);
    }
    expect(interactionUid).toBeDefined();

    const loginPage = await agent.get(`/interaction/${interactionUid}`).expect(200);
    const login = await agent
      .post(formAction(loginPage.text, 'login'))
      .type('form')
      .send({ username: adminUsername, password: adminPassword })
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(login.status);
    expect(login.headers.location).toBeDefined();

    const afterLogin = await followRedirects(agent, login.headers.location);
    let response = afterLogin.response;
    let finalUrl = afterLogin.url;
    if (response.status === 200 && /\/consent/i.test(response.text)) {
      const consent = await agent
        .post(formAction(response.text, 'consent'))
        .type('form')
        .send({ decision: 'accept' })
        .redirects(0);
      expect([301, 302, 303, 307, 308]).toContain(consent.status);
      expect(consent.headers.location).toBeDefined();
      const afterConsent = await followRedirects(agent, consent.headers.location);
      response = afterConsent.response;
      finalUrl = afterConsent.url;
    }

    const callback =
      finalUrl.origin === new URL(adminRedirectUri).origin &&
      finalUrl.pathname === new URL(adminRedirectUri).pathname
        ? finalUrl
        : new URL(response.headers.location ?? '', baseUrl);
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

  async function registerSecondClient(agent: request.SuperAgentTest, adminToken: string) {
    const initialToken = await agent
      .post('/api/admin/initial-access-tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const suffix = randomBytes(8).toString('hex');
    const redirectUri = testRedirectUri.endsWith('.html')
      ? testRedirectUri.replace(/\.html$/, `-${suffix}.html`)
      : `${testRedirectUri}/${suffix}`;
    const registration = await agent
      .post(new URL(discovery.body.registration_endpoint).pathname)
      .set('Authorization', `Bearer ${initialToken.body.token}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .send({
        client_name: `E2E Session Isolation ${Date.now()}`,
        redirect_uris: [redirectUri],
        scope: 'openid profile email',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        interaction_mode: 'hosted',
      })
      .expect(201);
    return { clientId: registration.body.client_id as string, redirectUri };
  }

  it('requires a fresh interaction when the browser switches to another client', async () => {
    const agent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(agent);
    const secondClient = await registerSecondClient(agent, adminToken);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { challenge } = createPkce();
    const params = new URLSearchParams({
      client_id: secondClient.clientId,
      redirect_uri: secondClient.redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: `switch-client-${randomBytes(6).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const switched = await agent
      .get(`${new URL(discovery.body.authorization_endpoint).pathname}?${params}`)
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(switched.status);
    expect(switched.headers.location).toBeDefined();

    const page = await followRedirects(agent, switched.headers.location);
    expect(page.response.status).toBe(200);
    expect(page.url.pathname).toMatch(/^\/interaction\//);
    expect(page.response.text).toMatch(/<form[^>]+action=["'][^"']*\/login/i);
    expect(page.response.text).not.toMatch(/<form[^>]+action=["'][^"']*\/consent/i);
  });
});
