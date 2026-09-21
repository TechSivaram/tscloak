import request from 'supertest';

describe('OIDC Discovery (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  it('should expose OIDC discovery metadata', async () => {
    const response = await request(baseUrl)
      .get('/.well-known/openid-configuration')
      .expect(200);

    expect(response.body).toHaveProperty('issuer');
    expect(response.body).toHaveProperty('authorization_endpoint');
    expect(response.body).toHaveProperty('token_endpoint');
    expect(response.body).toHaveProperty('jwks_uri');
    expect(response.body).toHaveProperty('registration_endpoint');
  });
});
