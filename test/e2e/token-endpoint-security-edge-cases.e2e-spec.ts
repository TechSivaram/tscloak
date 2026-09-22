import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';

describe('OIDC Token Endpoint Security Edge Cases (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';
  const username = process.env.E2E_USERNAME ?? 'admin';
  const password = process.env.E2E_PASSWORD ?? 'Password123!';

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return { verifier, challenge };
  }

  function authorizationPath(challenge: string) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: `token-security-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `/auth?${params.toString()}`;
  }

  async function followProviderContinuation(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ) {
    const url = new URL(location, baseUrl);

    return agent
      .get(`${url.pathname}${url.search}`)
      .redirects(0);
  }

  async function issueAuthorizationCode() {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = pkce();

    let response = await agent
      .get(authorizationPath(challenge))
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    let location = response.headers.location as string;
    let url = new URL(location, baseUrl);

    expect(url.pathname).toMatch(/^\/interaction\/[^/]+$/);

    response = await followProviderContinuation(agent, location);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<form');
    expect(response.text).toContain('password');

    const uid = url.pathname.split('/').pop();
    expect(uid).toBeDefined();

    response = await agent
      .post(`/interaction/${uid}/login`)
      .type('form')
      .send({
        username,
        password,
      })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    location = response.headers.location as string;

    // Login normally resumes through /auth/:uid. The provider may
    // immediately redirect to the consent interaction instead.
    response = await followProviderContinuation(agent, location);

    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.location
    ) {
      location = response.headers.location as string;
      url = new URL(location, baseUrl);

      if (url.pathname.startsWith('/interaction/')) {
        const consentUid = url.pathname.split('/').pop();
        expect(consentUid).toBeDefined();

        response = await agent
          .get(`${url.pathname}${url.search}`)
          .redirects(0);

        expect(response.status).toBe(200);

        response = await agent
          .post(`/interaction/${consentUid}/consent`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(response.status);
        expect(response.headers.location).toBeDefined();

        response = await followProviderContinuation(
          agent,
          response.headers.location as string,
        );
      }
    }

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    const callback = new URL(response.headers.location, baseUrl);
    expect(callback.origin + callback.pathname).toBe(
      new URL(redirectUri).origin + new URL(redirectUri).pathname,
    );
    expect(callback.searchParams.get('code')).toBeTruthy();

    return {
      code: callback.searchParams.get('code') as string,
      verifier,
    };
  }

  async function tokenRequest(fields: Record<string, string>) {
    return request(baseUrl)
      .post('/token')
      .type('form')
      .send(fields)
      .redirects(0);
  }

  it('rejects an unsupported grant_type', async () => {
    const response = await tokenRequest({
      grant_type: 'not-a-real-grant',
      client_id: clientId,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects a token request without an authorization code', async () => {
    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects a completely unknown authorization code', async () => {
    const { verifier } = pkce();

    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: randomBytes(32).toString('base64url'),
      code_verifier: verifier,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects an authorization code with the wrong PKCE verifier', async () => {
    const issued = await issueAuthorizationCode();

    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: issued.code,
      code_verifier: randomBytes(32).toString('base64url'),
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects an authorization code without code_verifier', async () => {
    const issued = await issueAuthorizationCode();

    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: issued.code,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects an authorization code when redirect_uri does not match', async () => {
    const issued = await issueAuthorizationCode();

    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: 'http://localhost:3000/idp-admin/wrong-callback',
      code: issued.code,
      code_verifier: issued.verifier,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects an authorization code when client_id does not match', async () => {
    const issued = await issueAuthorizationCode();

    const response = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: `wrong-${clientId}`,
      redirect_uri: redirectUri,
      code: issued.code,
      code_verifier: issued.verifier,
    });

    expect([400, 401]).toContain(response.status);
    expect(response.body).toHaveProperty('error');
  });

  it('rejects reuse of an authorization code after successful redemption', async () => {
    const issued = await issueAuthorizationCode();

    const first = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: issued.code,
      code_verifier: issued.verifier,
    });

    expect(first.status).toBe(200);
    expect(first.body).toHaveProperty('access_token');

    const second = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code: issued.code,
      code_verifier: issued.verifier,
    });

    expect([400, 401]).toContain(second.status);
    expect(second.body).toHaveProperty('error');
  });
});
