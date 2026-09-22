import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const ADMIN_CLIENT_ID =
  process.env.E2E_CLIENT_ID ??
  '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
const ADMIN_REDIRECT_URI =
  process.env.E2E_REDIRECT_URI ??
  'http://localhost:3000/idp-admin/callback.html';

const USERNAME = process.env.E2E_USERNAME ?? 'admin';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Password123!';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');

  return {
    verifier,
    challenge,
  };
}

function locationOf(response: request.Response): string {
  const location = response.headers.location;

  if (!location) {
    throw new Error(`Expected Location header, got ${response.status}`);
  }

  return location;
}

function interactionUidFromLocation(location: string): string {
  const pathname = new URL(location, BASE_URL).pathname;
  const match = pathname.match(/^\/interaction\/([^/]+)$/);

  if (!match) {
    throw new Error(`Expected /interaction/:uid, got ${pathname}`);
  }

  return match[1];
}

describe('Authorization code binding security (e2e)', () => {
  async function startAuthorization(
    agent: ReturnType<typeof request.agent>,
    overrides: Record<string, string> = {},
  ) {
    const { challenge } = pkce();

    const query = new URLSearchParams({
      client_id: ADMIN_CLIENT_ID,
      redirect_uri: ADMIN_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid',
      state: `binding-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...overrides,
    });

    return agent.get(`/auth?${query.toString()}`).redirects(0);
  }

  async function login(agent: ReturnType<typeof request.agent>, uid: string) {
    return agent
      .post(`/interaction/${uid}/login`)
      .type('form')
      .send({
        username: USERNAME,
        password: PASSWORD,
      })
      .redirects(0);
  }

  async function followInteraction(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ): Promise<string> {
    let current = location;

    for (let i = 0; i < 4; i++) {
      const url = new URL(current, BASE_URL);
      const pathname = url.pathname;

      if (pathname.startsWith('/auth/')) {
        const response = await agent
          .get(`${pathname}${url.search}`)
          .redirects(0);

        expect([302, 303]).toContain(response.status);
        current = locationOf(response);
        continue;
      }

      if (pathname.startsWith('/interaction/')) {
        const uid = pathname.split('/')[2];

        const page = await agent.get(`${pathname}${url.search}`).redirects(0);

        expect(page.status).toBe(200);

        const consent = await agent
          .post(`/interaction/${uid}/consent`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        expect([302, 303]).toContain(consent.status);
        current = locationOf(consent);
        continue;
      }

      return current;
    }

    throw new Error(`OIDC authorization flow did not complete: ${current}`);
  }

  async function obtainAuthorizationCode(
    agent: ReturnType<typeof request.agent>,
  ) {
    const authorization = await startAuthorization(agent);

    expect([302, 303]).toContain(authorization.status);

    const interactionLocation = locationOf(authorization);
    const interactionUrl = new URL(interactionLocation, BASE_URL);

    expect(interactionUrl.pathname).toMatch(/^\/interaction\//);

    const interactionUid = interactionUrl.pathname.split('/')[2];

    const loginResponse = await login(agent, interactionUid);

    expect([302, 303]).toContain(loginResponse.status);

    const finalLocation = await followInteraction(
      agent,
      locationOf(loginResponse),
    );

    return {
      callback: new URL(finalLocation, BASE_URL),
      interactionUid,
    };
  }

  it('returns an authorization code for the registered redirect URI', async () => {
    const agent = request.agent(BASE_URL);
    const { callback } = await obtainAuthorizationCode(agent);

    expect(callback.pathname).toBe(new URL(ADMIN_REDIRECT_URI).pathname);
    expect(callback.searchParams.get('code')).toBeTruthy();
  });

  it('rejects an authorization request with an unregistered redirect URI', async () => {
    const agent = request.agent(BASE_URL);

    const response = await startAuthorization(agent, {
      redirect_uri: 'http://localhost:3000/not-registered',
    });

    expect([400, 302]).toContain(response.status);

    if (response.status === 302) {
      const location = new URL(locationOf(response), BASE_URL);

      expect(location.pathname).not.toBe('/not-registered');
    }
  });

  it('does not issue a code when the redirect URI contains an unregistered query component', async () => {
    const agent = request.agent(BASE_URL);

    const response = await startAuthorization(agent, {
      redirect_uri: `${ADMIN_REDIRECT_URI}?unexpected=1`,
    });

    expect([400, 302]).toContain(response.status);

    if (response.status === 302) {
      const location = new URL(locationOf(response), BASE_URL);

      expect(location.pathname).not.toBe(new URL(ADMIN_REDIRECT_URI).pathname);
    }
  });

  it('binds an issued authorization code to the PKCE verifier', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge, verifier } = pkce();

    const query = new URLSearchParams({
      client_id: ADMIN_CLIENT_ID,
      redirect_uri: ADMIN_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid',
      state: 'pkce-binding',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const authorization = await agent
      .get(`/auth?${query.toString()}`)
      .redirects(0);

    expect([302, 303]).toContain(authorization.status);

    const interactionUrl = new URL(locationOf(authorization), BASE_URL);

    const uid = interactionUrl.pathname.split('/')[2];

    expect(interactionUrl.pathname).toMatch(/^\/interaction\//);

    const loginResponse = await login(agent, uid);

    expect([302, 303]).toContain(loginResponse.status);

    const location = await followInteraction(agent, locationOf(loginResponse));

    const callback = new URL(location, BASE_URL);
    const code = callback.searchParams.get('code');

    expect(code).toBeTruthy();

    const tokenResponse = await request(BASE_URL)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: ADMIN_REDIRECT_URI,
        client_id: ADMIN_CLIENT_ID,
        code_verifier: verifier,
      });

    expect([200, 400]).toContain(tokenResponse.status);
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.access_token).toBeTruthy();
  });

  it('rejects exchanging an authorization code with the wrong redirect URI', async () => {
    const agent = request.agent(BASE_URL);
    const { verifier } = pkce();

    const { callback } = await obtainAuthorizationCode(agent);
    const code = callback.searchParams.get('code');

    expect(code).toBeTruthy();

    const tokenResponse = await request(BASE_URL)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:3000/wrong-callback',
        client_id: ADMIN_CLIENT_ID,
        code_verifier: verifier,
      });

    expect(tokenResponse.status).not.toBe(200);
    expect(tokenResponse.body.error).toBeTruthy();
  });

  it('rejects an authorization code when it is presented by another client', async () => {
    const agent = request.agent(BASE_URL);
    const { verifier } = pkce();

    const { callback } = await obtainAuthorizationCode(agent);
    const code = callback.searchParams.get('code');

    expect(code).toBeTruthy();

    const response = await request(BASE_URL).post('/token').type('form').send({
      grant_type: 'authorization_code',
      code,
      redirect_uri: ADMIN_REDIRECT_URI,
      client_id: 'not-the-issued-client',
      code_verifier: verifier,
    });

    expect(response.status).not.toBe(200);
    expect(response.body.error).toBeTruthy();
  });
});
