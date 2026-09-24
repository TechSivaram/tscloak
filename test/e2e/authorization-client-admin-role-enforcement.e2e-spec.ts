import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC client-admin portal role enforcement (e2e)', () => {
  jest.setTimeout(30_000);

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const adminClientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';
  const roleAdminUsername = process.env.E2E_ROLE_ADMIN_USERNAME ?? adminUsername;
  const roleAdminPassword = process.env.E2E_ROLE_ADMIN_PASSWORD ?? adminPassword;
  const adminRedirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';
  const clientAdminRedirectUri =
    process.env.E2E_CLIENT_ADMIN_REDIRECT_URI ??
    `${baseUrl.replace(/\/$/, '')}/idp-client-admin/callback.html`;
  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  function formAction(html: string, endpoint: 'login' | 'consent') {
    return html.match(
      new RegExp(`<form[^>]+action=["']([^"']*\\/${endpoint}[^"']*)["']`, 'i'),
    )?.[1];
  }

  async function authenticateAdmin(
    agent: request.SuperAgentTest,
    credentials = { username: adminUsername, password: adminPassword },
  ) {
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { verifier, challenge } = pkce();
    const authorization = new URL(discovery.body.authorization_endpoint);
    authorization.searchParams.set('client_id', adminClientId);
    authorization.searchParams.set('redirect_uri', adminRedirectUri);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('scope', 'openid profile email');
    authorization.searchParams.set('state', `role-admin-${randomBytes(6).toString('hex')}`);
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 'S256');

    let response = await agent
      .get(`${authorization.pathname}${authorization.search}`)
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(response.status);

    let callback: URL | undefined;
    for (let step = 0; step < 20; step += 1) {
      if (response.headers.location) {
        const target = new URL(response.headers.location, baseUrl);
        if (
          target.origin === new URL(adminRedirectUri).origin &&
          target.pathname === new URL(adminRedirectUri).pathname
        ) {
          callback = target;
          break;
        }
        response = await agent
          .get(`${target.pathname}${target.search}`)
          .redirects(0);
        continue;
      }

      const loginAction = formAction(response.text ?? '', 'login');
      if (loginAction) {
        const url = new URL(loginAction, baseUrl);
        response = await agent
          .post(`${url.pathname}${url.search}`)
          .type('form')
          .send(credentials)
          .redirects(0);
        continue;
      }

      const consentAction = formAction(response.text ?? '', 'consent');
      if (consentAction) {
        const url = new URL(consentAction, baseUrl);
        response = await agent
          .post(`${url.pathname}${url.search}`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);
        continue;
      }

      throw new Error(`Unexpected admin authorization response ${response.status}`);
    }
    expect(callback).toBeDefined();
    const code = callback!.searchParams.get('code');
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

  it('rejects a valid client user without IDP_CLIENT_ADMIN on the client-admin callback', async () => {
    const adminAgent = request.agent(baseUrl);
    const adminToken = await authenticateAdmin(adminAgent);
    const username = `nonadmin-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'NonAdminTest123!';
    const user = await adminAgent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: adminClientId,
      })
      .expect(201);
    expect(user.body.id).toBeTruthy();

    const agent = request.agent(baseUrl);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { challenge } = pkce();
    const authorization = new URL(discovery.body.authorization_endpoint);
    authorization.searchParams.set('client_id', adminClientId);
    authorization.searchParams.set('redirect_uri', clientAdminRedirectUri);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('scope', 'openid profile email');
    authorization.searchParams.set('state', `role-denied-${randomBytes(6).toString('hex')}`);
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 'S256');

    const start = await agent
      .get(`${authorization.pathname}${authorization.search}`)
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(start.status);
    expect(start.headers.location).toBeDefined();
    const interaction = new URL(start.headers.location, baseUrl);
    expect(interaction.pathname).toMatch(/^\/interaction\//);
    const page = await agent.get(interaction.pathname).expect(200);
    const loginAction = formAction(page.text, 'login');
    expect(loginAction).toBeDefined();
    const loginUrl = new URL(loginAction!, baseUrl);
    const denied = await agent
      .post(`${loginUrl.pathname}${loginUrl.search}`)
      .type('form')
      .send({ username, password })
      .redirects(0);

    expect(denied.status).toBe(401);
    expect(denied.text).toMatch(/not allowed to access this portal/i);
  });

  it('allows a client user with IDP_CLIENT_ADMIN to advance past login', async () => {
    const roleAdminAgent = request.agent(baseUrl);
    const roleAdminToken = await authenticateAdmin(roleAdminAgent, {
      username: roleAdminUsername,
      password: roleAdminPassword,
    });
    const username = `clientadmin-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const password = 'ClientAdminTest123!';
    const user = await roleAdminAgent
      .post('/api/users')
      .set('Authorization', `Bearer ${roleAdminToken}`)
      .send({
        username,
        email: `${username}@example.test`,
        password,
        clientId: adminClientId,
      })
      .expect(201);

    const assignment = await roleAdminAgent
      .put(`/api/users/${user.body.id}/roles`)
      .query({ client_id: adminClientId })
      .set('Authorization', `Bearer ${roleAdminToken}`)
      .send({ roles: ['IDP_CLIENT_ADMIN'] })
      .expect(200);
    if (!assignment.body.roles?.includes('IDP_CLIENT_ADMIN')) {
      throw new Error(
        'Role assignment did not grant IDP_CLIENT_ADMIN. Set E2E_ROLE_ADMIN_USERNAME and E2E_ROLE_ADMIN_PASSWORD to an IDP_ADMIN account that is not also an IDP_CLIENT_ADMIN.',
      );
    }

    const agent = request.agent(baseUrl);
    const discovery = await agent.get('/.well-known/openid-configuration').expect(200);
    const { challenge } = pkce();
    const authorization = new URL(discovery.body.authorization_endpoint);
    authorization.searchParams.set('client_id', adminClientId);
    authorization.searchParams.set('redirect_uri', clientAdminRedirectUri);
    authorization.searchParams.set('response_type', 'code');
    authorization.searchParams.set('scope', 'openid profile email');
    authorization.searchParams.set('state', `clientadmin-allowed-${randomBytes(6).toString('hex')}`);
    authorization.searchParams.set('code_challenge', challenge);
    authorization.searchParams.set('code_challenge_method', 'S256');

    const start = await agent
      .get(`${authorization.pathname}${authorization.search}`)
      .redirects(0);
    expect([301, 302, 303, 307, 308]).toContain(start.status);
    expect(start.headers.location).toBeDefined();
    const interaction = new URL(start.headers.location, baseUrl);
    const page = await agent.get(interaction.pathname).expect(200);
    const loginAction = formAction(page.text, 'login');
    expect(loginAction).toBeDefined();
    const loginUrl = new URL(loginAction!, baseUrl);
    const login = await agent
      .post(`${loginUrl.pathname}${loginUrl.search}`)
      .type('form')
      .send({ username, password })
      .redirects(0);
    if (login.status === 401) {
      throw new Error(`Client-admin login rejected: ${login.text}`);
    }
    expect([301, 302, 303]).toContain(login.status);
    expect(login.headers.location).toBeDefined();

    const continuationUrl = new URL(login.headers.location, baseUrl);
    const continuation = await agent
      .get(`${continuationUrl.pathname}${continuationUrl.search}`)
      .redirects(0);
    expect([301, 302, 303]).toContain(continuation.status);
    expect(continuation.headers.location).toBeDefined();
    const next = new URL(continuation.headers.location, baseUrl);
    expect(
      next.pathname.startsWith('/interaction/') ||
        next.pathname === new URL(clientAdminRedirectUri).pathname,
    ).toBe(true);
    expect(next.searchParams.get('error')).toBeNull();
  });

});
