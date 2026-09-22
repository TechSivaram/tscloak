import crypto from 'node:crypto';
import request from 'supertest';

const BASE_URL = process.env.OIDC_BASE_URL ?? 'http://localhost:3000';

const ADMIN_CLIENT_ID =
  process.env.E2E_ADMIN_CLIENT_ID ??
  '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

const ADMIN_REDIRECT_URI =
  process.env.E2E_ADMIN_REDIRECT_URI ??
  'http://localhost:3000/idp-admin/callback.html';

const ADMIN_SCOPE = 'openid profile email';
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'Password123!';

type Agent = request.SuperAgentTest;

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

function extractInteractionUid(location: string): string {
  const url = new URL(location, BASE_URL);
  const match = url.pathname.match(/^\/interaction\/([^/]+)$/);

  if (!match) {
    throw new Error(`Expected interaction URL, received ${location}`);
  }

  return decodeURIComponent(match[1]);
}

async function resolveNextInteraction(
  agent: Agent,
  location: string,
): Promise<{
  interactionUid: string;
  response?: request.Response;
}> {
  let url = new URL(location, BASE_URL);

  for (let i = 0; i < 10; i++) {
    if (url.pathname.startsWith('/interaction/')) {
      return { interactionUid: extractInteractionUid(url.toString()) };
    }

    // nest-oidc-provider uses /auth/:uid as the authorization
    // continuation endpoint after an interaction has finished.
    // That endpoint must be requested before the provider can either
    // start the next custom interaction or redirect to the client.
    const response = await agent
      .get(`${url.pathname}${url.search}`)
      .redirects(0);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.headers.location) {
        throw new Error(`Redirect ${response.status} has no Location header`);
      }

      url = new URL(response.headers.location, BASE_URL);
      continue;
    }

    throw new Error(
      `Expected next interaction or redirect, received ${response.status}: ${response.text}`,
    );
  }

  throw new Error('Too many redirects while resolving next OIDC interaction');
}

async function followRedirects(
  agent: Agent,
  location: string,
): Promise<{ response: request.Response; url: URL }> {
  let url = new URL(location, BASE_URL);

  for (let i = 0; i < 10; i++) {
    const response = await agent
      .get(`${url.pathname}${url.search}`)
      .redirects(0);

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, url };
    }

    if (!response.headers.location) {
      throw new Error(`Redirect ${response.status} has no Location header`);
    }

    url = new URL(response.headers.location, BASE_URL);
  }

  throw new Error('Too many redirects while processing OIDC flow');
}

async function startAuthorization(
  overrides: Record<string, string | undefined> = {},
): Promise<{
  agent: Agent;
  response: request.Response;
  interactionUid: string;
  verifier: string;
}> {
  const agent = request.agent(BASE_URL);
  const { verifier, challenge } = pkcePair();

  const params = new URLSearchParams({
    client_id: ADMIN_CLIENT_ID,
    redirect_uri: ADMIN_REDIRECT_URI,
    response_type: 'code',
    scope: ADMIN_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  });

  const response = await agent.get(`/auth?${params.toString()}`).redirects(0);

  expect([301, 302, 303, 307, 308]).toContain(response.status);
  expect(response.headers.location).toBeDefined();

  const interactionUid = extractInteractionUid(response.headers.location);

  return { agent, response, interactionUid, verifier };
}

async function completeLogin(
  agent: Agent,
  interactionUid: string,
): Promise<request.Response> {
  return agent
    .post(`/interaction/${encodeURIComponent(interactionUid)}/login`)
    .type('form')
    .send({
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
    })
    .redirects(0);
}

async function completeConsent(
  agent: Agent,
  interactionUid: string,
  decision: 'accept' | 'reject',
): Promise<request.Response> {
  return agent
    .post(`/interaction/${encodeURIComponent(interactionUid)}/consent`)
    .type('form')
    .send({ decision })
    .redirects(0);
}

async function completeAuthorization(
  agent: Agent,
  interactionUid: string,
): Promise<URL> {
  const loginResponse = await completeLogin(agent, interactionUid);

  expect([301, 302, 303, 307, 308]).toContain(loginResponse.status);
  expect(loginResponse.headers.location).toBeDefined();

  const consentLocation = loginResponse.headers.location;
  const { interactionUid: consentUid } = await resolveNextInteraction(
    agent,
    consentLocation,
  );

  const consentResponse = await completeConsent(agent, consentUid, 'accept');

  expect([301, 302, 303, 307, 308]).toContain(consentResponse.status);
  expect(consentResponse.headers.location).toBeDefined();

  const callbackResult = await followRedirects(
    agent,
    consentResponse.headers.location,
  );

  expect(callbackResult.url.pathname).toBe(
    new URL(ADMIN_REDIRECT_URI).pathname,
  );

  return callbackResult.url;
}

function callbackWithCode(callback: URL): string {
  const error = callback.searchParams.get('error');

  if (error) {
    throw new Error(
      `OIDC authorization failed: ${error}: ${
        callback.searchParams.get('error_description') ?? ''
      }`,
    );
  }

  const code = callback.searchParams.get('code');
  expect(code).toBeTruthy();

  return code!;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Expected a JWT with three segments');
  }

  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

async function exchangeCode(
  agent: Agent,
  code: string,
  verifier?: string,
): Promise<request.Response> {
  const payload: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    client_id: ADMIN_CLIENT_ID,
    redirect_uri: ADMIN_REDIRECT_URI,
  };

  if (verifier !== undefined) {
    payload.code_verifier = verifier;
  }

  return agent.post('/token').type('form').send(payload);
}

describe('OIDC Authorization Security (e2e)', () => {
  describe('state and nonce', () => {
    it('preserves state through the authorization response', async () => {
      const state = `state-${Date.now()}`;
      const { agent, interactionUid } = await startAuthorization({ state });

      const callback = await completeAuthorization(agent, interactionUid);

      expect(callback.searchParams.get('state')).toBe(state);
      expect(callback.searchParams.get('code')).toBeTruthy();
    });

    it('propagates nonce into the issued ID token', async () => {
      const nonce = `nonce-${Date.now()}`;
      const { agent, interactionUid, verifier } = await startAuthorization({
        nonce,
      });

      const callback = await completeAuthorization(agent, interactionUid);
      const code = callbackWithCode(callback);
      const tokenResponse = await exchangeCode(agent, code, verifier);

      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body.id_token).toBeTruthy();

      const idToken = decodeJwtPayload(tokenResponse.body.id_token);
      expect(idToken.nonce).toBe(nonce);
    });
  });

  describe('authorization-code lifecycle', () => {
    it('rejects reuse of an authorization code', async () => {
      const { agent, interactionUid, verifier } = await startAuthorization();
      const callback = await completeAuthorization(agent, interactionUid);
      const code = callbackWithCode(callback);

      const firstTokenResponse = await exchangeCode(agent, code, verifier);

      expect(firstTokenResponse.status).toBe(200);

      const secondTokenResponse = await exchangeCode(agent, code, verifier);

      expect([400, 401]).toContain(secondTokenResponse.status);
      expect(
        secondTokenResponse.body?.error ?? secondTokenResponse.text,
      ).toMatch(/invalid|reuse|used|code/i);
    });
  });

  describe('PKCE verifier validation', () => {
    it('rejects an incorrect code_verifier', async () => {
      const { agent, interactionUid, verifier } = await startAuthorization();
      const callback = await completeAuthorization(agent, interactionUid);
      const code = callbackWithCode(callback);

      const tokenResponse = await exchangeCode(
        agent,
        code,
        `${verifier}-wrong`,
      );

      expect([400, 401]).toContain(tokenResponse.status);
      expect(tokenResponse.body?.error ?? tokenResponse.text).toMatch(
        /invalid|verifier|pkce|code/i,
      );
    });

    it('rejects an authorization-code exchange without code_verifier', async () => {
      const { agent, interactionUid } = await startAuthorization();
      const callback = await completeAuthorization(agent, interactionUid);
      const code = callbackWithCode(callback);

      const tokenResponse = await exchangeCode(agent, code);

      expect([400, 401]).toContain(tokenResponse.status);
      expect(tokenResponse.body?.error ?? tokenResponse.text).toMatch(
        /invalid|verifier|pkce|code/i,
      );
    });

    it('accepts the correct PKCE code_verifier', async () => {
      const { agent, interactionUid, verifier } = await startAuthorization();
      const callback = await completeAuthorization(agent, interactionUid);
      const code = callbackWithCode(callback);

      const tokenResponse = await exchangeCode(agent, code, verifier);

      expect(tokenResponse.status).toBe(200);
      expect(tokenResponse.body).toHaveProperty('access_token');
      expect(tokenResponse.body).toHaveProperty('token_type');
    });
  });

  describe('prompt behavior', () => {
    it('supports prompt=login and returns to the login interaction', async () => {
      const { agent, response, interactionUid } = await startAuthorization({
        prompt: 'login',
      });

      expect([301, 302, 303, 307, 308]).toContain(response.status);
      expect(interactionUid).toBeTruthy();

      const interactionResponse = await agent.get(
        `/interaction/${encodeURIComponent(interactionUid)}`,
      );

      expect(interactionResponse.status).toBe(200);
      expect(interactionResponse.text).toMatch(/login|username|password/i);
    });

    it('supports prompt=consent after authentication', async () => {
      const { agent, interactionUid } = await startAuthorization({
        prompt: 'login consent',
      });

      const loginResponse = await completeLogin(agent, interactionUid);

      expect([301, 302, 303, 307, 308]).toContain(loginResponse.status);
      expect(loginResponse.headers.location).toBeDefined();

      const { interactionUid: consentUid } = await resolveNextInteraction(
        agent,
        loginResponse.headers.location,
      );

      const consentPage = await agent.get(
        `/interaction/${encodeURIComponent(consentUid)}`,
      );

      expect(consentPage.status).toBe(200);
      expect(consentPage.text).toMatch(
        /consent|allow|approve|permission|scope/i,
      );
    });

    it('returns access_denied when consent is rejected', async () => {
      const { agent, interactionUid } = await startAuthorization({
        prompt: 'login consent',
      });

      const loginResponse = await completeLogin(agent, interactionUid);

      expect([301, 302, 303, 307, 308]).toContain(loginResponse.status);
      expect(loginResponse.headers.location).toBeDefined();

      const { interactionUid: consentUid } = await resolveNextInteraction(
        agent,
        loginResponse.headers.location,
      );

      const consentResponse = await completeConsent(
        agent,
        consentUid,
        'reject',
      );

      expect([301, 302, 303, 307, 308]).toContain(consentResponse.status);
      expect(consentResponse.headers.location).toBeDefined();

      const callbackResult = await followRedirects(
        agent,
        consentResponse.headers.location,
      );

      expect(callbackResult.url.pathname).toBe(
        new URL(ADMIN_REDIRECT_URI).pathname,
      );
      expect(callbackResult.url.searchParams.get('error')).toBe(
        'access_denied',
      );
    });
  });
});
