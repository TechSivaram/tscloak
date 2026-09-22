import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';

describe('OIDC ID Token Security Edge Cases (e2e)', () => {
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
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  function decodeJwtPart(value: string) {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
  }

  async function follow(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ) {
    const url = new URL(location, baseUrl);

    return agent.get(`${url.pathname}${url.search}`).redirects(0);
  }

  async function issueTokenSet() {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = pkce();
    const nonce = `nonce-${randomBytes(16).toString('hex')}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email roles',
      prompt: 'consent',
      state: `id-token-security-${randomBytes(8).toString('hex')}`,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    let response = await agent.get(`/auth?${params.toString()}`).redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    let location = response.headers.location;
    let url = new URL(location, baseUrl);

    expect(url.pathname).toMatch(/^\/interaction\/[^/]+$/);

    response = await follow(agent, location);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<form');
    expect(response.text).toContain('password');

    let uid = url.pathname.split('/').pop();
    expect(uid).toBeDefined();

    response = await agent
      .post(`/interaction/${uid}/login`)
      .type('form')
      .send({ username, password })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    response = await follow(agent, response.headers.location);

    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.location
    ) {
      location = response.headers.location;
      url = new URL(location, baseUrl);

      if (url.pathname.startsWith('/interaction/')) {
        uid = url.pathname.split('/').pop();
        expect(uid).toBeDefined();

        response = await agent.get(`${url.pathname}${url.search}`).redirects(0);

        expect(response.status).toBe(200);
        expect(response.text).toContain('consent');

        response = await agent
          .post(`/interaction/${uid}/consent`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(response.status);
        expect(response.headers.location).toBeDefined();

        response = await follow(agent, response.headers.location);
      }
    }

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeDefined();

    const callback = new URL(response.headers.location, baseUrl);
    const code = callback.searchParams.get('code');

    expect(code).toBeTruthy();
    expect(callback.searchParams.get('state')).toBeTruthy();

    const token = await request(baseUrl).post('/token').type('form').send({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    });

    expect(token.status).toBe(200);
    expect(token.body.access_token).toBeTruthy();
    expect(token.body.id_token).toBeTruthy();

    return {
      token: token.body as Record<string, unknown>,
      nonce,
    };
  }

  it('returns an ID token for an OpenID authorization-code request', async () => {
    const { token } = await issueTokenSet();

    expect(typeof token.id_token).toBe('string');
    expect((token.id_token as string).split('.')).toHaveLength(3);
  });

  it('returns a structurally valid JWT ID token', async () => {
    const { token } = await issueTokenSet();

    const [encodedHeader, encodedPayload, encodedSignature] = (
      token.id_token as string
    ).split('.');

    expect(encodedHeader).toBeTruthy();
    expect(encodedPayload).toBeTruthy();
    expect(encodedSignature).toBeTruthy();

    const header = decodeJwtPart(encodedHeader);
    const payload = decodeJwtPart(encodedPayload);

    expect(header.alg).toBe('RS256');
    if (header.typ !== undefined) {
      expect(header.typ).toBe('JWT');
    }

    expect(typeof payload.iss).toBe('string');
    expect(typeof payload.sub).toBe('string');
    expect(payload.aud).toBe(clientId);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });

  it('binds the ID token nonce to the authorization request', async () => {
    const { token, nonce } = await issueTokenSet();

    const parts = (token.id_token as string).split('.');
    const payload = decodeJwtPart(parts[1]);

    expect(payload.nonce).toBe(nonce);
  });

  it('does not issue an ID token when the authorization request omits openid scope', async () => {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = pkce();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'profile email roles',
      prompt: 'consent',
      state: `no-openid-${randomBytes(8).toString('hex')}`,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const response = await agent.get(`/auth?${params.toString()}`).redirects(0);

    expect([400, 303]).toContain(response.status);

    if (response.status === 400) {
      expect(response.text).toMatch(/openid|scope|invalid/i);
      return;
    }

    expect(response.headers.location).toBeDefined();

    const interaction = await follow(agent, response.headers.location);

    expect(interaction.status).toBe(200);

    const url = new URL(response.headers.location, baseUrl);
    const uid = url.pathname.split('/').pop();

    expect(uid).toBeDefined();

    const login = await agent
      .post(`/interaction/${uid}/login`)
      .type('form')
      .send({ username, password })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(login.status);
    expect(login.headers.location).toBeDefined();

    const continued = await follow(agent, login.headers.location);

    if (
      [301, 302, 303, 307, 308].includes(continued.status) &&
      continued.headers.location
    ) {
      const consentUrl = new URL(continued.headers.location, baseUrl);

      if (consentUrl.pathname.startsWith('/interaction/')) {
        const consentUid = consentUrl.pathname.split('/').pop();

        expect(consentUid).toBeDefined();

        const consent = await agent
          .post(`/interaction/${consentUid}/consent`)
          .type('form')
          .send({ decision: 'accept' })
          .redirects(0);

        expect([301, 302, 303, 307, 308]).toContain(consent.status);
        expect(consent.headers.location).toBeDefined();

        let location = consent.headers.location;
        let callback: URL | undefined;

        for (let i = 0; i < 10; i += 1) {
          const current = new URL(location, baseUrl);
          const next = await agent
            .get(`${current.pathname}${current.search}`)
            .redirects(0);

          if (![301, 302, 303, 307, 308].includes(next.status)) {
            callback = current;
            break;
          }

          expect(next.headers.location).toBeDefined();
          location = next.headers.location;
        }

        expect(callback).toBeDefined();
        const code = callback!.searchParams.get('code');

        // OAuth authorization-code requests are valid without the OIDC
        // `openid` scope. The important invariant is that exchanging the
        // resulting code does not produce an ID token.
        expect(code).toBeTruthy();
        expect(callback.searchParams.get('error')).toBeNull();

        const token = await request(baseUrl).post('/token').type('form').send({
          grant_type: 'authorization_code',
          client_id: clientId,
          redirect_uri: redirectUri,
          code,
          code_verifier: verifier,
        });

        expect(token.status).toBe(200);
        expect(token.body.access_token).toBeTruthy();
        expect(token.body.id_token).toBeUndefined();
      }
    }
  });

  it('does not expose an unsigned ID token algorithm', async () => {
    const { token } = await issueTokenSet();

    const [encodedHeader] = (token.id_token as string).split('.');
    const header = decodeJwtPart(encodedHeader);

    expect(header.alg).not.toBe('none');
    expect(header.alg).toBe('RS256');
  });

  it('keeps the ID token audience bound to the requesting client', async () => {
    const { token } = await issueTokenSet();

    const parts = (token.id_token as string).split('.');
    const payload = decodeJwtPart(parts[1]);

    expect(payload.aud).toBe(clientId);
    expect(payload.aud).not.toBe('');
  });
});
