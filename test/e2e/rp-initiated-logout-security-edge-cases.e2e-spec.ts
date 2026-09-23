import request from 'supertest';

describe('RP-Initiated Logout Security Edge Cases (e2e)', () => {
  const baseUrl =
    process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

  const clientId =
    process.env.E2E_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const sessionEndPath = process.env.E2E_SESSION_END_PATH ?? '/session/end';

  const unregisteredRedirect = `${new URL(baseUrl).origin}/logout-not-registered-${Date.now()}`;

  function sessionEndQuery(params: Record<string, string>): string {
    const query = new URLSearchParams(params);
    return `${sessionEndPath}?${query.toString()}`;
  }

  function unsignedJwt(payload: Record<string, unknown>): string {
    const encode = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');

    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
  }

  async function expectBadRequest(path: string) {
    const response = await request(baseUrl).get(path).redirects(0);

    expect(response.status).toBe(400);
    return response;
  }

  it('rejects an unknown client_id', async () => {
    await expectBadRequest(
      sessionEndQuery({
        client_id: 'client-that-does-not-exist',
      }),
    );
  });

  it('rejects an unregistered post_logout_redirect_uri for a known client', async () => {
    await expectBadRequest(
      sessionEndQuery({
        client_id: clientId,
        post_logout_redirect_uri: unregisteredRedirect,
      }),
    );
  });

  it('rejects an external post_logout_redirect_uri instead of allowing open redirect behavior', async () => {
    await expectBadRequest(
      sessionEndQuery({
        client_id: clientId,
        post_logout_redirect_uri: 'https://evil.example/steal',
      }),
    );
  });

  it('rejects duplicate security-sensitive query parameters', async () => {
    const path =
      `${sessionEndPath}?client_id=${encodeURIComponent(clientId)}` +
      `&client_id=${encodeURIComponent(clientId)}`;

    await expectBadRequest(path);
  });

  it('rejects a malformed id_token_hint', async () => {
    await expectBadRequest(
      sessionEndQuery({
        id_token_hint: 'not-a-jwt',
      }),
    );
  });

  it('rejects an id_token_hint whose audience does not match client_id', async () => {
    const hint = unsignedJwt({
      aud: 'another-client',
      sub: 'test-user',
      iss: new URL(baseUrl).origin,
    });

    await expectBadRequest(
      sessionEndQuery({
        id_token_hint: hint,
        client_id: clientId,
      }),
    );
  });

  it('rejects an unsigned id_token_hint for the registered client', async () => {
    const hint = unsignedJwt({
      aud: clientId,
      sub: 'test-user',
      iss: new URL(baseUrl).origin,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    });

    await expectBadRequest(
      sessionEndQuery({
        id_token_hint: hint,
      }),
    );
  });

  it('does not accept post_logout_redirect_uri without a recognized client context', async () => {
    const response = await request(baseUrl)
      .get(
        sessionEndQuery({
          post_logout_redirect_uri: unregisteredRedirect,
        }),
      )
      .redirects(0);

    expect([200, 302, 303]).toContain(response.status);

    if (response.headers.location) {
      const location = new URL(response.headers.location, baseUrl);

      expect(location.origin).not.toBe(new URL(unregisteredRedirect).origin);
      expect(location.href).not.toContain(unregisteredRedirect);
    }
  });
});
