const params = new URLSearchParams(
  window.location.search,
);

const error = params.get('error');

const code = params.get('code');

const state = params.get('state');

const expectedState = sessionStorage.getItem(
  'tscloak_admin_state',
);

const codeVerifier = sessionStorage.getItem(
  'tscloak_admin_code_verifier',
);

const expectedNonce = sessionStorage.getItem(
  'tscloak_admin_nonce',
);

const status = document.getElementById('status');

function failAuthentication(message, errorMessage) {
  status.textContent = message;

  throw new Error(errorMessage);
}

function decodeBase64Url(value) {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padding =
    '='.repeat((4 - (normalized.length % 4)) % 4);

  return atob(normalized + padding);
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string') {
    throw new Error('ID token is not a string');
  }

  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid ID token format');
  }

  const payload = JSON.parse(
    decodeBase64Url(parts[1]),
  );

  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid ID token payload');
  }

  return payload;
}

function getConfiguredIssuer() {
  const issuer = sessionStorage.getItem(
    'tscloak_admin_issuer',
  );

  return issuer || window.location.origin;
}

if (error) {
  failAuthentication(
    'Authentication failed.',
    `OIDC authorization failed: ${error}`,
  );
}

if (!code) {
  failAuthentication(
    'Authorization code was not returned.',
    'Missing authorization code',
  );
}

if (
  !state ||
  !expectedState ||
  state !== expectedState
) {
  failAuthentication(
    'Invalid authentication state.',
    'OIDC state mismatch',
  );
}

if (!codeVerifier) {
  failAuthentication(
    'PKCE verifier is missing.',
    'Missing PKCE code verifier',
  );
}

if (!expectedNonce) {
  failAuthentication(
    'Authentication nonce is missing.',
    'Missing OIDC nonce',
  );
}

async function exchangeCode() {
  const clientId = sessionStorage.getItem(
    'tscloak_admin_client_id',
  );

  const redirectUri = sessionStorage.getItem(
    'tscloak_admin_redirect_uri',
  );

  if (!clientId) {
    throw new Error(
      'Admin OIDC client configuration is missing',
    );
  }

  if (!redirectUri) {
    throw new Error(
      'Admin OIDC redirect URI configuration is missing',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',

    client_id: clientId,

    code,

    redirect_uri: redirectUri,

    code_verifier: codeVerifier,
  });

  const response = await fetch('/token', {
    method: 'POST',

    headers: {
      'Content-Type':
        'application/x-www-form-urlencoded',
    },

    body,
  });

  if (!response.ok) {
    throw new Error(
      'Authorization code exchange failed',
    );
  }

  const tokens = await response.json();

  if (
    !tokens ||
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token
  ) {
    throw new Error(
      'Access token was not returned',
    );
  }

  /*
   * An ID token is required for this OIDC login because
   * the nonce must be validated before trusting the
   * authentication result.
   */
  if (
    typeof tokens.id_token !== 'string' ||
    !tokens.id_token
  ) {
    throw new Error(
      'ID token was not returned',
    );
  }

  /*
   * Validate the ID token claims that are relevant to
   * this browser authentication flow.
   *
   * Signature validation is performed by the authorization
   * server/provider during issuance. This browser-side
   * validation is an additional check and must not be
   * considered a replacement for cryptographic validation.
   */
  const idTokenPayload =
    decodeJwtPayload(tokens.id_token);

  if (idTokenPayload.nonce !== expectedNonce) {
    throw new Error(
      'OIDC nonce mismatch',
    );
  }

  const issuer = getConfiguredIssuer();

  if (idTokenPayload.iss !== issuer) {
    throw new Error(
      'OIDC issuer mismatch',
    );
  }

  const audience = idTokenPayload.aud;

  const validAudience =
    typeof audience === 'string'
      ? audience === clientId
      : Array.isArray(audience) &&
        audience.includes(clientId);

  if (!validAudience) {
    throw new Error(
      'OIDC audience mismatch',
    );
  }

  /*
   * Check the access token against the authenticated
   * user before storing the browser session.
   */
  const profileResponse = await fetch('/me', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
    },
  });

  const profile = profileResponse.ok
    ? await profileResponse.json()
    : null;

  if (!profileResponse.ok) {
    throw new Error(
      'Unable to retrieve authenticated user profile',
    );
  }

  if (
    !profile?.roles?.includes('IDP_ADMIN')
  ) {
    throw new Error(
      'Access denied: IDP_ADMIN role is required for this portal',
    );
  }

  /*
   * Store the browser session.
   *
   * NOTE:
   * sessionStorage is still accessible to JavaScript.
   * This should be replaced with an HttpOnly server-side
   * session in a later hardening step.
   */
  sessionStorage.setItem(
    'tscloak_admin_access_token',
    tokens.access_token,
  );

  sessionStorage.setItem(
    'tscloak_admin_id_token',
    tokens.id_token,
  );

  if (tokens.refresh_token) {
    sessionStorage.setItem(
      'tscloak_admin_refresh_token',
      tokens.refresh_token,
    );
  }

  /*
   * Authentication transaction values are single-use.
   */
  sessionStorage.removeItem(
    'tscloak_admin_state',
  );

  sessionStorage.removeItem(
    'tscloak_admin_code_verifier',
  );

  sessionStorage.removeItem(
    'tscloak_admin_nonce',
  );

  window.location.href =
    '/idp-admin/dashboard.html';
}

exchangeCode().catch((error) => {
  /*
   * Do not leave authentication material behind after
   * an unsuccessful authentication attempt.
   */
  sessionStorage.removeItem(
    'tscloak_admin_access_token',
  );

  sessionStorage.removeItem(
    'tscloak_admin_refresh_token',
  );

  sessionStorage.removeItem(
    'tscloak_admin_id_token',
  );

  sessionStorage.removeItem(
    'tscloak_admin_client_id',
  );

  sessionStorage.removeItem(
    'tscloak_admin_redirect_uri',
  );

  sessionStorage.removeItem(
    'tscloak_admin_post_logout_redirect_uri',
  );

  sessionStorage.removeItem(
    'tscloak_admin_state',
  );

  sessionStorage.removeItem(
    'tscloak_admin_code_verifier',
  );

  sessionStorage.removeItem(
    'tscloak_admin_nonce',
  );

  console.error(error);

  status.textContent =
    'Unable to complete authentication.';
});