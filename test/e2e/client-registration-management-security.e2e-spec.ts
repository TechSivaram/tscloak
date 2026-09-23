import request from 'supertest';

describe('Dynamic Client Registration Management Security (e2e)', () => {
  const baseUrl =
    process.env.E2E_BASE_URL ??
    process.env.BASE_URL ??
    'http://localhost:3000';

  const registrationPath =
    process.env.E2E_REGISTRATION_PATH ?? '/reg';

  const knownClientId =
    process.env.E2E_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const unknownClientId =
    `client-does-not-exist-${Date.now()}`;

  async function expectUnauthorized(
    method: 'get' | 'put' | 'delete',
    path: string,
    token?: string,
  ) {
    let req = request(baseUrl)[method](path);

    if (token !== undefined) {
      req = req.set('Authorization', `Bearer ${token}`);
    }

    const response = await req.redirects(0);

    expect([400, 401, 403, 404]).toContain(response.status);
    return response;
  }

  it('rejects management access to a client without a registration access token', async () => {
    await expectUnauthorized(
      'get',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
    );
  });

  it('rejects management access with an invalid registration access token', async () => {
    await expectUnauthorized(
      'get',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
      'invalid-registration-access-token',
    );
  });

  it('rejects client update without a registration access token', async () => {
    await expectUnauthorized(
      'put',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
    );
  });

  it('rejects client update with an invalid registration access token', async () => {
    await expectUnauthorized(
      'put',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
      'invalid-registration-access-token',
    );
  });

  it('rejects client deletion without a registration access token', async () => {
    await expectUnauthorized(
      'delete',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
    );
  });

  it('rejects client deletion with an invalid registration access token', async () => {
    await expectUnauthorized(
      'delete',
      `${registrationPath}/${encodeURIComponent(knownClientId)}`,
      'invalid-registration-access-token',
    );
  });

  it('does not expose an unknown client through unauthenticated registration management', async () => {
    await expectUnauthorized(
      'get',
      `${registrationPath}/${encodeURIComponent(unknownClientId)}`,
    );
  });

  it('does not allow an unknown client to be deleted without registration credentials', async () => {
    await expectUnauthorized(
      'delete',
      `${registrationPath}/${encodeURIComponent(unknownClientId)}`,
      'invalid-registration-access-token',
    );
  });
});
