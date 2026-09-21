import request from 'supertest';

describe('Initial Access Token API (e2e)', () => {
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  it('should reject creation without an access token', async () => {
    await request(baseUrl).post('/api/admin/initial-access-tokens').expect(401);
  });

  it('should reject listing without an access token', async () => {
    await request(baseUrl).get('/api/admin/initial-access-tokens').expect(401);
  });
});
