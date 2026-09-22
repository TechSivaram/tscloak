import request from 'supertest';

const baseUrl =
  process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

describe('OIDC JWKS endpoint (e2e)', () => {
  let discovery: request.Response;
  let jwks: request.Response;

  beforeAll(async () => {
    discovery = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);
    expect(discovery.body).toBeDefined();
    expect(typeof discovery.body.jwks_uri).toBe('string');
  });

  beforeAll(async () => {
    const jwksUrl = new URL(discovery.body.jwks_uri);
    jwks = await request(baseUrl)
      .get(`${jwksUrl.pathname}${jwksUrl.search}`)
      .expect(200);
  });

  it('publishes a jwks_uri in discovery', () => {
    expect(discovery.body.jwks_uri).toBeTruthy();
    const jwksUrl = new URL(discovery.body.jwks_uri);
    expect(jwksUrl.origin).toBe(new URL(baseUrl).origin);
  });

  it('returns a JSON Web Key Set', () => {
    expect(jwks.headers['content-type']).toMatch(/json/i);
    expect(Array.isArray(jwks.body.keys)).toBe(true);
    expect(jwks.body.keys.length).toBeGreaterThan(0);
  });

  it('publishes RSA signing keys with expected public JWK fields', () => {
    for (const key of jwks.body.keys) {
      expect(key.kty).toBe('RSA');
      expect(typeof key.n).toBe('string');
      expect(key.n.length).toBeGreaterThan(0);
      expect(typeof key.e).toBe('string');
      expect(key.e.length).toBeGreaterThan(0);
      expect(typeof key.kid).toBe('string');
      expect(key.kid.length).toBeGreaterThan(0);

      if (key.use !== undefined) expect(key.use).toBe('sig');
      if (key.alg !== undefined) expect(key.alg).toBe('RS256');

      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
      expect(key.q).toBeUndefined();
      expect(key.dp).toBeUndefined();
      expect(key.dq).toBeUndefined();
      expect(key.qi).toBeUndefined();
    }
  });

  it('does not expose duplicate key identifiers', () => {
    const kids = jwks.body.keys
      .map((key: { kid?: string }) => key.kid)
      .filter((kid: string | undefined): kid is string => Boolean(kid));
    expect(new Set(kids).size).toBe(kids.length);
  });

  it('returns the same public key set on repeated requests', async () => {
    const jwksUrl = new URL(discovery.body.jwks_uri);
    const second = await request(baseUrl)
      .get(`${jwksUrl.pathname}${jwksUrl.search}`)
      .expect(200);
    expect(second.body).toEqual(jwks.body);
  });

  it('rejects unsupported HTTP methods', async () => {
    const jwksUrl = new URL(discovery.body.jwks_uri);
    const response = await request(baseUrl)
      .post(`${jwksUrl.pathname}${jwksUrl.search}`)
      .send({})
      .ok(() => true);
    expect([404, 405]).toContain(response.status);
  });
});
