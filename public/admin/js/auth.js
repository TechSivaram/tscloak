const oidc = {
  clientId: '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363',

  redirectUri:
    `${window.location.origin}/admin/callback.html`,

  scope:
    'openid profile email offline_access roles',

  prompt: 'consent',
};

function randomString(length = 64) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
    'abcdefghijklmnopqrstuvwxyz' +
    '0123456789-._~';

  const values = new Uint8Array(length);

  crypto.getRandomValues(values);

  return Array.from(values)
    .map(value => chars[value % chars.length])
    .join('');
}

function base64UrlEncode(buffer) {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(buffer)
    )
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createPkce() {

  const codeVerifier =
    randomString(64);

  const data =
    new TextEncoder()
      .encode(codeVerifier);

  const digest =
    await crypto.subtle.digest(
      'SHA-256',
      data
    );

  const codeChallenge =
    base64UrlEncode(digest);

  return {
    codeVerifier,
    codeChallenge,
  };
}

async function login() {

  const {
    codeVerifier,
    codeChallenge,
  } = await createPkce();

  const state =
    randomString(32);

  const nonce =
    randomString(32);

  sessionStorage.setItem(
    'tscloak_admin_code_verifier',
    codeVerifier
  );

  sessionStorage.setItem(
    'tscloak_admin_state',
    state
  );

  sessionStorage.setItem(
    'tscloak_admin_nonce',
    nonce
  );

  const params =
    new URLSearchParams({
      client_id: oidc.clientId,

      redirect_uri:
        oidc.redirectUri,

      response_type: 'code',

      scope: oidc.scope,

      prompt: oidc.prompt,

      state,

      nonce,

      code_challenge:
        codeChallenge,

      code_challenge_method:
        'S256',
    });

  window.location.href =
    `/auth?${params.toString()}`;
}

document
  .getElementById('loginButton')
  .addEventListener('click', login);