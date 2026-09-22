import crypto from 'node:crypto';
import request from 'supertest';

const BASE_URL = process.env.OIDC_BASE_URL ?? 'http://localhost:3000';

const ADMIN_CLIENT_ID = '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363';

const ADMIN_REDIRECT_URI = 'http://localhost:3000/idp-admin/callback.html';

const ADMIN_SCOPE = 'openid profile email';

function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');

  return { verifier, challenge };
}

function authorizationParams(overrides = {}) {
  return new URLSearchParams({
    client_id: ADMIN_CLIENT_ID,
    redirect_uri: ADMIN_REDIRECT_URI,
    response_type: 'code',
    scope: ADMIN_SCOPE,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined),
    ),
  });
}

function locationOf(response) {
  const location = response.headers.location;

  if (!location) {
    throw new Error(
      `Expected redirect location, received ${response.status}: ${response.text}`,
    );
  }

  return location;
}

function interactionUid(location) {
  const url = new URL(location, BASE_URL);
  const match = url.pathname.match(/^\/interaction\/([^/]+)$/);

  if (!match) {
    throw new Error(`Expected interaction URL, received ${location}`);
  }

  return decodeURIComponent(match[1]);
}

function authUid(location) {
  const url = new URL(location, BASE_URL);
  const match = url.pathname.match(/^\/auth\/([^/]+)$/);

  if (!match) {
    throw new Error(`Expected /auth/:uid URL, received ${location}`);
  }

  return decodeURIComponent(match[1]);
}

async function followAuth(agent, location) {
  return agent
    .get(`/auth/${encodeURIComponent(authUid(location))}`)
    .redirects(0);
}

async function login(agent, uid) {
  return agent
    .post(`/interaction/${encodeURIComponent(uid)}/login`)
    .type('form')
    .send({
      username: process.env.E2E_USERNAME ?? 'admin',
      password: process.env.E2E_PASSWORD ?? 'Password123!',
    })
    .redirects(0);
}

async function consent(agent, uid, decision) {
  return agent
    .post(`/interaction/${encodeURIComponent(uid)}/consent`)
    .type('form')
    .send({ decision })
    .redirects(0);
}

async function startLogin(agent, overrides = {}) {
  const response = await agent
    .get(`/auth?${authorizationParams(overrides).toString()}`)
    .redirects(0);

  expect([302, 303]).toContain(response.status);

  return {
    response,
    uid: interactionUid(locationOf(response)),
  };
}

async function completeLoginToNextInteraction(agent, uid) {
  const loginResponse = await login(agent, uid);

  expect([302, 303]).toContain(loginResponse.status);

  let location = locationOf(loginResponse);

  while (/^\/auth\//.test(new URL(location, BASE_URL).pathname)) {
    const next = await followAuth(agent, location);

    expect([302, 303]).toContain(next.status);
    location = locationOf(next);
  }

  return interactionUid(location);
}

describe('OIDC Authorization Session Security (e2e)', () => {
  it('returns login_required for prompt=none without an authenticated session', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const response = await agent
      .get(
        `/auth?${authorizationParams({
          prompt: 'none',
          state: 'prompt-none-state',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }).toString()}`,
      )
      .redirects(0);

    expect([302, 303]).toContain(response.status);

    const callback = new URL(locationOf(response), BASE_URL);

    expect(callback.pathname).toBe(new URL(ADMIN_REDIRECT_URI).pathname);
    expect(callback.searchParams.get('error')).toBe('login_required');
    expect(callback.searchParams.get('state')).toBe('prompt-none-state');
  });

  it('preserves the authenticated account in the interaction after login', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const { uid } = await startLogin(agent, {
      state: 'session-preserved',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const nextInteractionUid = await completeLoginToNextInteraction(agent, uid);

    expect(nextInteractionUid).toBeTruthy();

    const interactionPage = await agent.get(
      `/interaction/${encodeURIComponent(nextInteractionUid)}`,
    );

    expect(interactionPage.status).toBe(200);
    expect(interactionPage.text).toMatch(
      /consent|allow|approve|permission|scope/i,
    );
  });

  it('requires a fresh authentication when prompt=none is sent without a reusable session', async () => {
    const loginAgent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const { uid } = await startLogin(loginAgent, {
      state: 'login-for-prompt-none',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const consentUid = await completeLoginToNextInteraction(loginAgent, uid);

    const consentPage = await loginAgent.get(
      `/interaction/${encodeURIComponent(consentUid)}`,
    );

    expect(consentPage.status).toBe(200);
    expect(consentPage.text).toMatch(/consent|allow|approve|permission|scope/i);

    const separateAgent = request.agent(BASE_URL);
    const { challenge: noneChallenge } = pkcePair();

    const response = await separateAgent
      .get(
        `/auth?${authorizationParams({
          prompt: 'none',
          state: 'fresh-session-required',
          code_challenge: noneChallenge,
          code_challenge_method: 'S256',
        }).toString()}`,
      )
      .redirects(0);

    expect([302, 303]).toContain(response.status);

    const callback = new URL(locationOf(response), BASE_URL);

    expect(callback.pathname).toBe(new URL(ADMIN_REDIRECT_URI).pathname);
    expect(callback.searchParams.get('error')).toBe('login_required');
    expect(callback.searchParams.get('state')).toBe('fresh-session-required');
  });

  it('shows consent when an authenticated interaction has missing scopes', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const { uid } = await startLogin(agent, {
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const consentUid = await completeLoginToNextInteraction(agent, uid);

    const response = await agent.get(
      `/interaction/${encodeURIComponent(consentUid)}`,
    );

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/consent|allow|approve|permission|scope/i);
  });

  it('explicit prompt=consent creates a consent interaction after login', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const { uid } = await startLogin(agent, {
      prompt: 'login consent',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const consentUid = await completeLoginToNextInteraction(agent, uid);

    const response = await agent.get(
      `/interaction/${encodeURIComponent(consentUid)}`,
    );

    expect(response.status).toBe(200);
    expect(response.text).toMatch(/consent|allow|approve|permission|scope/i);
  });

  it('allows consent rejection to return access_denied', async () => {
    const agent = request.agent(BASE_URL);
    const { challenge } = pkcePair();

    const { uid } = await startLogin(agent, {
      prompt: 'login consent',
      state: 'consent-rejected',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    const consentUid = await completeLoginToNextInteraction(agent, uid);

    const rejection = await consent(agent, consentUid, 'reject');

    expect([302, 303]).toContain(rejection.status);

    // nest-oidc-provider first redirects the rejected interaction
    // back through /auth/:uid. Follow that continuation before
    // asserting the final client callback.
    let location = locationOf(rejection);

    if (/^\/auth\//.test(new URL(location, BASE_URL).pathname)) {
      const continuation = await followAuth(agent, location);

      expect([302, 303]).toContain(continuation.status);
      location = locationOf(continuation);
    }

    const callback = new URL(location, BASE_URL);

    expect(callback.pathname).toBe(new URL(ADMIN_REDIRECT_URI).pathname);
    expect(callback.searchParams.get('error')).toBe('access_denied');
    expect(callback.searchParams.get('state')).toBe('consent-rejected');
  });
});
