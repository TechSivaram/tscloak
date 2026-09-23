import {
  createHash,
  createPublicKey,
  createVerify,
  randomBytes,
} from 'node:crypto';
import request from 'supertest';

describe('OIDC ID Token Claims Security (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const clientId =
    process.env.E2E_ADMIN_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';
  const redirectUri =
    process.env.E2E_ADMIN_REDIRECT_URI ??
    'http://localhost:3000/idp-admin/callback.html';
  const username = process.env.E2E_USERNAME ?? 'admin';
  const password = process.env.E2E_PASSWORD ?? 'Password123!';

  type JwtPayload = Record<string, unknown>;

  function pkce() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    return { verifier, challenge };
  }

  function decodeJwtPart(value: string): JwtPayload {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as JwtPayload;
  }

  async function follow(
    agent: ReturnType<typeof request.agent>,
    location: string,
  ) {
    const url = new URL(location, baseUrl);

    return agent.get(`${url.pathname}${url.search}`).redirects(0);
  }

  async function authorizeAndExchange(
    options: {
      nonce?: string;
      extraParams?: Record<string, string>;
    } = {},
  ) {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = pkce();
    const nonce = options.nonce ?? `nonce-${randomBytes(16).toString('hex')}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email roles',
      prompt: 'consent',
      state: `claims-${randomBytes(8).toString('hex')}`,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(options.extraParams ?? {}),
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
    expect(token.body.id_token).toBeTruthy();

    return {
      token: token.body as Record<string, unknown>,
      nonce,
    };
  }

  async function discovery() {
    const response = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    expect(typeof response.body.issuer).toBe('string');
    expect(typeof response.body.jwks_uri).toBe('string');

    return response.body as {
      issuer: string;
      jwks_uri: string;
    };
  }

  function jwtParts(idToken: unknown) {
    expect(typeof idToken).toBe('string');

    const parts = (idToken as string).split('.');
    expect(parts).toHaveLength(3);

    return {
      encodedHeader: parts[0],
      encodedPayload: parts[1],
      encodedSignature: parts[2],
      header: decodeJwtPart(parts[0]),
      payload: decodeJwtPart(parts[1]),
    };
  }

  it('sets the ID token issuer to the provider issuer', async () => {
    const [{ token }, metadata] = await Promise.all([
      authorizeAndExchange(),
      discovery(),
    ]);

    const { payload } = jwtParts(token.id_token);

    expect(payload.iss).toBe(metadata.issuer);
  });

  it('sets the ID token subject to the authenticated account', async () => {
    const { token } = await authorizeAndExchange();
    const { payload } = jwtParts(token.id_token);

    expect(typeof payload.sub).toBe('string');
    expect((payload.sub as string).length).toBeGreaterThan(0);
  });

  it('binds audience and optional azp to the requesting client', async () => {
    const { token } = await authorizeAndExchange();
    const { payload } = jwtParts(token.id_token);

    expect(payload.aud).toBe(clientId);

    if (payload.azp !== undefined) {
      expect(payload.azp).toBe(clientId);
    }
  });

  it('contains valid issued-at and expiration timestamps', async () => {
    const before = Math.floor(Date.now() / 1000);
    const { token } = await authorizeAndExchange();
    const after = Math.floor(Date.now() / 1000);
    const { payload } = jwtParts(token.id_token);

    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');

    const iat = payload.iat as number;
    const exp = payload.exp as number;

    expect(iat).toBeGreaterThanOrEqual(before - 5);
    expect(iat).toBeLessThanOrEqual(after + 5);
    expect(exp).toBeGreaterThan(iat);
  });

  it('preserves the exact nonce supplied by the authorization request', async () => {
    const nonce = `nonce-exact-${randomBytes(16).toString('hex')}`;
    const { token } = await authorizeAndExchange({ nonce });
    const { payload } = jwtParts(token.id_token);

    expect(payload.nonce).toBe(nonce);
  });

  it('includes auth_time when max_age is requested', async () => {
    const { token } = await authorizeAndExchange({
      extraParams: {
        max_age: '3600',
      },
    });

    const { payload } = jwtParts(token.id_token);

    expect(typeof payload.auth_time).toBe('number');
    expect(payload.auth_time as number).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 5,
    );
  });

  it('uses a signed asymmetric JWT algorithm for the ID token', async () => {
    const { token } = await authorizeAndExchange();
    const { header } = jwtParts(token.id_token);

    expect(header.alg).toBe('RS256');
    expect(header.alg).not.toBe('none');
    expect(header.kid).toBeTruthy();
  });

  it('cryptographically verifies the ID token signature using the published JWKS', async () => {
    const { token } = await authorizeAndExchange();
    const { jwks_uri } = await discovery();
    const { encodedHeader, encodedPayload, encodedSignature, header } =
      jwtParts(token.id_token);

    const jwksUrl = new URL(jwks_uri, baseUrl);
    const response = await request(baseUrl)
      .get(`${jwksUrl.pathname}${jwksUrl.search}`)
      .expect(200);

    expect(Array.isArray(response.body.keys)).toBe(true);

    const jwk = response.body.keys.find(
      (candidate: Record<string, unknown>) =>
        candidate.kid === header.kid &&
        candidate.kty === 'RSA' &&
        candidate.n &&
        candidate.e,
    ) as Record<string, unknown> | undefined;

    expect(jwk).toBeDefined();

    const publicKey = createPublicKey({
      key: {
        kty: 'RSA',
        n: jwk!.n,
        e: jwk!.e,
      },
      format: 'jwk',
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    const signature = Buffer.from(encodedSignature, 'base64url');

    expect(verifier.verify(publicKey, signature)).toBe(true);
  });
});
