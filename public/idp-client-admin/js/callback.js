const params = new URLSearchParams(window.location.search);

const status = document.getElementById('status');

const redirectUri = sessionStorage.getItem('tscloak_client_admin_redirect_uri');

const code = params.get('code');

const state = params.get('state');

const expectedState = sessionStorage.getItem('tscloak_client_admin_state');

const expectedNonce = sessionStorage.getItem('tscloak_client_admin_nonce');

const clientId = sessionStorage.getItem('tscloak_client_admin_client_id');

const codeVerifier = sessionStorage.getItem(
  'tscloak_client_admin_code_verifier',
);

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');

  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);

  return atob(normalized + padding);
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string' || !token) {
    throw new Error('ID token is missing');
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  let payload;

  try {
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    throw new Error('Invalid ID token payload');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid ID token payload');
  }

  return payload;
}

function getConfiguredIssuer() {
  return (
    sessionStorage.getItem('tscloak_client_admin_issuer') ||
    window.location.origin
  );
}

function clearAuthenticationState() {
  [
    'tscloak_client_admin_access_token',
    'tscloak_client_admin_id_token',
    'tscloak_client_admin_refresh_token',
    'tscloak_client_admin_client_id',
    'tscloak_client_admin_redirect_uri',
    'tscloak_client_admin_post_logout_redirect_uri',
    'tscloak_client_admin_issuer',
    'tscloak_client_admin_state',
    'tscloak_client_admin_code_verifier',
    'tscloak_client_admin_nonce',
  ].forEach((key) => {
    sessionStorage.removeItem(key);
  });
}

if (!code) {
  status.textContent =
    'Authentication failed. Authorization code was not returned.';

  throw new Error('Missing authorization code');
}

if (!state || !expectedState || state !== expectedState) {
  status.textContent = 'Authentication failed. Invalid callback state.';

  throw new Error('Invalid client admin callback state');
}

if (!clientId) {
  status.textContent =
    'Authentication failed. OIDC client configuration is missing.';

  throw new Error('Missing client admin OIDC client ID');
}

if (!redirectUri) {
  status.textContent = 'Authentication failed. Redirect URI is missing.';

  throw new Error('Missing client admin redirect URI');
}

if (!codeVerifier) {
  status.textContent = 'Authentication failed. PKCE verifier is missing.';

  throw new Error('Missing client admin PKCE verifier');
}

if (!expectedNonce) {
  status.textContent = 'Authentication failed. OIDC nonce is missing.';

  throw new Error('Missing client admin OIDC nonce');
}

(async () => {
  const response = await fetch('/token', {
    method: 'POST',

    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },

    body: new URLSearchParams({
      grant_type: 'authorization_code',

      client_id: clientId,

      code,

      redirect_uri: redirectUri,

      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Authorization code exchange failed (${response.status})${
        errorBody ? `: ${errorBody.slice(0, 240)}` : ''
      }`,
    );
  }

  const tokens = await response.json();

  if (
    !tokens ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token
  ) {
    throw new Error('Access token was not returned');
  }

  /*
   * This is an OpenID Connect login, so require an ID token.
   * The nonce from the authorization request must match the
   * nonce contained in the returned ID token.
   */
  if (typeof tokens.id_token !== 'string' || !tokens.id_token) {
    throw new Error('ID token was not returned');
  }

  const idTokenPayload = decodeJwtPayload(tokens.id_token);

  /*
   * OIDC nonce validation.
   *
   * This binds the returned ID token to the authentication
   * transaction initiated by this browser.
   */
  if (idTokenPayload.nonce !== expectedNonce) {
    throw new Error('OIDC nonce mismatch');
  }

  /*
   * Validate issuer.
   */
  const expectedIssuer = getConfiguredIssuer();

  if (idTokenPayload.iss !== expectedIssuer) {
    throw new Error('OIDC issuer mismatch');
  }

  /*
   * Validate audience.
   *
   * The ID token must have been issued for the client
   * that initiated this authentication request.
   */
  const audience = idTokenPayload.aud;

  const validAudience =
    typeof audience === 'string'
      ? audience === clientId
      : Array.isArray(audience) && audience.includes(clientId);

  if (!validAudience) {
    throw new Error('OIDC audience mismatch');
  }

  /*
   * Validate the authenticated user through the access token
   * before establishing the client-admin browser session.
   */
  const profileResponse = await fetch('/me', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,

      Accept: 'application/json',
    },
  });

  if (!profileResponse.ok) {
    const errorBody = await profileResponse.text();
    throw new Error(
      `Profile request failed (${profileResponse.status})${
        errorBody ? `: ${errorBody.slice(0, 240)}` : ''
      }`,
    );
  }

  const profile = await profileResponse.json();

  /*
   * Client-admin access requires the explicit
   * IDP_CLIENT_ADMIN role.
   */
  if (!profile?.roles?.includes('IDP_CLIENT_ADMIN')) {
    throw new Error(
      'Access denied: IDP_CLIENT_ADMIN role is required for this portal',
    );
  }

  /*
   * Store the authenticated browser session.
   *
   * NOTE:
   * These values are still accessible to JavaScript because
   * the current architecture uses sessionStorage.
   *
   * A later security improvement should move the session to
   * an HttpOnly + Secure + SameSite cookie backed by a server-
   * side session.
   */
  sessionStorage.setItem(
    'tscloak_client_admin_access_token',
    tokens.access_token,
  );

  sessionStorage.setItem('tscloak_client_admin_id_token', tokens.id_token);

  if (tokens.refresh_token) {
    sessionStorage.setItem(
      'tscloak_client_admin_refresh_token',
      tokens.refresh_token,
    );
  }

  /*
   * Authentication transaction values are single-use.
   */
  sessionStorage.removeItem('tscloak_client_admin_state');

  sessionStorage.removeItem('tscloak_client_admin_code_verifier');

  sessionStorage.removeItem('tscloak_client_admin_nonce');

  window.location.href = './dashboard.html';
})().catch((error) => {
  clearAuthenticationState();

  console.error(error);

  status.textContent =
    error instanceof Error
      ? error.message
      : 'Unable to complete authentication.';
});
