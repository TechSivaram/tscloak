const oidc = {
  clientId: null,

  redirectUri:
    `${window.location.origin}/idp-admin/callback.html`,

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

  const clientResponse =
    await fetch(
      '/api/admin/config/oidc?portal=admin',
    );

  if (!clientResponse.ok) {
    throw new Error('Admin OIDC client is not configured');
  }

  const clientConfig = await clientResponse.json();
  oidc.clientId = clientConfig.clientId;
  oidc.redirectUri = clientConfig.redirectUri;
  oidc.postLogoutRedirectUri = clientConfig.postLogoutRedirectUri;

  sessionStorage.setItem(
    'tscloak_admin_client_id',
    oidc.clientId,
  );
  sessionStorage.setItem(
    'tscloak_admin_redirect_uri',
    oidc.redirectUri,
  );
  if (oidc.postLogoutRedirectUri) {
    sessionStorage.setItem(
      'tscloak_admin_post_logout_redirect_uri',
      oidc.postLogoutRedirectUri,
    );
  }

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

      redirect_uri: oidc.redirectUri,

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