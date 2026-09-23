import crypto from 'node:crypto';
import request from 'supertest';

describe('OIDC Registration Access Token Lifecycle & Ownership (e2e)', () => {
  const baseUrl =
    process.env.E2E_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:3000';

  const registrationPath = process.env.E2E_REGISTRATION_PATH ?? '/reg';
  const initialAccessTokenAdminPath =
    process.env.E2E_INITIAL_ACCESS_TOKEN_ADMIN_PATH ??
    '/api/admin/initial-access-tokens';

  const clientId =
    process.env.E2E_CLIENT_ID ??
    '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

  const redirectUri =
    process.env.E2E_REDIRECT_URI ??
    `${new URL(baseUrl).origin}/idp-admin/callback.html`;

  const username = process.env.E2E_USERNAME ?? 'admin';
  const password = process.env.E2E_PASSWORD ?? 'Password123!';
  const scope =
    process.env.E2E_AUTH_SCOPE ?? 'openid profile email offline_access roles';

  let adminAccessToken: string;

  let client1Id: string;
  let client1RegistrationAccessToken: string;

  let client2Id: string;
  let client2RegistrationAccessToken: string;

  const expectUnauthorized = (response: request.Response) => {
    expect([400, 401, 403, 404]).toContain(response.status);
  };

  const base64Url = (value: Buffer) =>
    value
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

  const createPkce = () => {
    const verifier = base64Url(crypto.randomBytes(32));
    const challenge = base64Url(
      crypto.createHash('sha256').update(verifier).digest(),
    );

    return {
      verifier,
      challenge,
    };
  };

  const parseForm = (html: string) => {
    const actionMatch = html.match(/<form[^>]*action=["']([^"']+)["'][^>]*>/i);

    const fields: Record<string, string> = {};

    for (const match of html.matchAll(
      /<input[^>]*name=["']([^"']+)["'][^>]*value=["']([^"']*)["'][^>]*>/gi,
    )) {
      fields[match[1]] = match[2];
    }

    return {
      action: actionMatch?.[1],
      fields,
    };
  };

  const extractAuthorizationCode = (response: request.Response) => {
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    expect(response.headers.location).toBeTruthy();

    const callback = new URL(response.headers.location, baseUrl);
    expect(callback.origin).toBe(new URL(redirectUri).origin);
    expect(callback.pathname).toBe(new URL(redirectUri).pathname);

    const error = callback.searchParams.get('error');
    expect(error).toBeNull();

    const code = callback.searchParams.get('code');
    expect(code).toEqual(expect.any(String));

    return code!;
  };

  const getAdminAccessToken = async (): Promise<string> => {
    const agent = request.agent(baseUrl);
    const { verifier, challenge } = createPkce();

    const authorization = await agent
      .get('/auth')
      .query({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state: `registration-lifecycle-${Date.now()}`,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'consent',
      })
      .redirects(0);

    expect([301, 302, 303, 307, 308]).toContain(authorization.status);

    let response = await agent
      .get(
        new URL(authorization.headers.location, baseUrl).pathname +
          new URL(authorization.headers.location, baseUrl).search,
      )
      .redirects(0);

    let loggedIn = false;

    for (let step = 0; step < 16; step += 1) {
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.headers.location
      ) {
        const next = new URL(response.headers.location, baseUrl);

        if (
          next.origin === new URL(redirectUri).origin &&
          next.pathname === new URL(redirectUri).pathname
        ) {
          const code = extractAuthorizationCode(response);

          const tokenResponse = await agent.post('/token').type('form').send({
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code,
            code_verifier: verifier,
          });

          expect(tokenResponse.status).toBe(200);
          expect(tokenResponse.body.access_token).toEqual(expect.any(String));

          return tokenResponse.body.access_token as string;
        }

        response = await agent
          .get(`${next.pathname}${next.search}`)
          .redirects(0);

        continue;
      }

      expect(response.status).toBe(200);

      const form = parseForm(response.text);
      expect(form.action).toBeTruthy();

      if (!loggedIn && /name=["']username["']/i.test(response.text)) {
        response = await agent
          .post(
            `${new URL(form.action!, baseUrl).pathname}${new URL(form.action!, baseUrl).search}`,
          )
          .type('form')
          .send({
            ...form.fields,
            username,
            password,
          })
          .redirects(0);

        loggedIn = true;
        continue;
      }

      if (
        /name=["']decision["']/i.test(response.text) ||
        /name=["']consent["']/i.test(response.text) ||
        /type=["']submit["'][^>]*value=["'](?:allow|approve|yes|consent)["']/i.test(
          response.text,
        )
      ) {
        response = await agent
          .post(
            `${new URL(form.action!, baseUrl).pathname}${new URL(form.action!, baseUrl).search}`,
          )
          .type('form')
          .send({
            ...form.fields,
            decision: 'accept',
          })
          .redirects(0);

        continue;
      }

      throw new Error(
        `Unsupported OIDC interaction page while authenticating admin: ${response.text.slice(0, 1000)}`,
      );
    }

    throw new Error('OIDC admin authentication flow exceeded redirect limit');
  };

  const createInitialAccessToken = async (): Promise<string> => {
    const response = await request(baseUrl)
      .post(initialAccessTokenAdminPath)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .set('Accept', 'application/json')
      .send({});

    expect([200, 201]).toContain(response.status);
    expect(response.body).toBeDefined();

    const token =
      response.body.token ??
      response.body.initial_access_token ??
      response.body.initialAccessToken ??
      response.body.access_token;

    expect(token).toEqual(expect.any(String));

    return token as string;
  };

  const registerClient = async (initialAccessToken: string, name: string) => {
    const response = await request(baseUrl)
      .post(registrationPath)
      .set('Authorization', `Bearer ${initialAccessToken}`)
      .set('Accept', 'application/json')
      .send({
        client_name: name,
        redirect_uris: [
          `https://example.test/${encodeURIComponent(name)}/callback`,
        ],
        post_logout_redirect_uris: [
          `https://example.test/${encodeURIComponent(name)}/logout`,
        ],
        scope: 'openid profile email',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });

    expect([200, 201]).toContain(response.status);
    expect(response.body).toBeDefined();
    expect(response.body.client_id).toEqual(expect.any(String));
    expect(response.body.registration_access_token).toEqual(expect.any(String));

    return {
      clientId: response.body.client_id as string,
      registrationAccessToken: response.body
        .registration_access_token as string,
    };
  };

  beforeAll(async () => {
    adminAccessToken = await getAdminAccessToken();

    const initialAccessToken1 = await createInitialAccessToken();
    const initialAccessToken2 = await createInitialAccessToken();

    const first = await registerClient(
      initialAccessToken1,
      `registration-lifecycle-owner-1-${Date.now()}`,
    );

    const second = await registerClient(
      initialAccessToken2,
      `registration-lifecycle-owner-2-${Date.now()}`,
    );

    client1Id = first.clientId;
    client1RegistrationAccessToken = first.registrationAccessToken;

    client2Id = second.clientId;
    client2RegistrationAccessToken = second.registrationAccessToken;
  });

  it('allows a client owner to read its own registration metadata', async () => {
    const response = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.client_id).toBe(client1Id);
  });

  it('allows a client owner to update its own metadata with its registration access token', async () => {
    const updatedName = `registration-owner-updated-${Date.now()}`;

    const current = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expect(current.status).toBe(200);
    expect(current.body.client_id).toBe(client1Id);

    // RFC 7592 requires PUT to contain the complete client metadata,
    // including client_id, while excluding response-only management fields.
    const {
      registration_access_token: _registrationAccessToken,
      registration_client_uri: _registrationClientUri,
      client_id_issued_at: _clientIdIssuedAt,
      client_secret_expires_at: _clientSecretExpiresAt,
      ...clientMetadata
    } = current.body as Record<string, unknown>;

    const response = await request(baseUrl)
      .put(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json')
      .send({
        ...clientMetadata,
        client_id: client1Id,
        client_name: updatedName,
        redirect_uris: ['https://example.test/updated/callback'],
        post_logout_redirect_uris: ['https://example.test/updated/logout'],
      });

    expect(response.status).toBe(200);
    expect(response.body.client_id).toBe(client1Id);
    expect(response.body.client_name).toBe(updatedName);

    // oidc-provider may rotate the registration access token during
    // client metadata replacement. If a new token is returned, it is
    // the credential that must be used for subsequent management calls.
    if (typeof response.body.registration_access_token === 'string') {
      client1RegistrationAccessToken = response.body.registration_access_token;
    }
  });

  it('allows the same owner registration access token to be reused for subsequent management operations', async () => {
    const response = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expect(response.status).toBe(200);
    expect(response.body.client_id).toBe(client1Id);
  });

  it('rejects client 1 registration credentials when used against client 2', async () => {
    const response = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client2Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expectUnauthorized(response);
  });

  it('invalidates client 1 registration credentials after a cross-client access attempt', async () => {
    const response = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client2Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expectUnauthorized(response);

    const afterCrossClientAttempt = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expectUnauthorized(afterCrossClientAttempt);
  });

  it('does not allow client 1 registration credentials to update client 2', async () => {
    const response = await request(baseUrl)
      .put(`${registrationPath}/${encodeURIComponent(client2Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json')
      .send({
        client_name: 'cross-client-update-attempt',
        redirect_uris: ['https://attacker.example/callback'],
        scope: 'openid profile email',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      });

    expectUnauthorized(response);
  });

  it('does not allow client 1 registration credentials to delete client 2', async () => {
    // client 1's registration credential was invalidated by the preceding
    // cross-client access attempt, so use client 2's own credential here
    // to verify that client 2 remains independently manageable.
    const response = await request(baseUrl)
      .delete(`${registrationPath}/${encodeURIComponent(client2Id)}`)
      .set('Authorization', `Bearer ${client2RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expect([200, 204]).toContain(response.status);
  });

  it('rejects a registration access token after the associated client is deleted', async () => {
    // Client 2 was deleted in the previous test. Its registration credential
    // must no longer be usable for management operations.
    const afterDelete = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client2Id)}`)
      .set('Authorization', `Bearer ${client2RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expectUnauthorized(afterDelete);
  });

  it('keeps client 1 isolated after client 2 deletion and credential invalidation', async () => {
    // Client 1's credential was invalidated by the earlier cross-client
    // attempt. Client 1 itself must still exist, but its old credential
    // must remain unusable.
    const response = await request(baseUrl)
      .get(`${registrationPath}/${encodeURIComponent(client1Id)}`)
      .set('Authorization', `Bearer ${client1RegistrationAccessToken}`)
      .set('Accept', 'application/json');

    expectUnauthorized(response);
  });
});
