const params = new URLSearchParams(location.search);

const status = document.getElementById('status');

const redirectUri = sessionStorage.getItem(
  'tscloak_client_admin_redirect_uri'
);

const code = params.get('code');

const state = params.get('state');

if (
  !code ||
  state !== sessionStorage.getItem(
    'tscloak_client_admin_state'
  )
) {
  status.textContent =
    'Authentication failed. Invalid callback state.';

  throw new Error(
    'Invalid client admin callback'
  );
}

(async () => {
  const response = await fetch('/token', {
    method: 'POST',

    headers: {
      'Content-Type':
        'application/x-www-form-urlencoded',
    },

    body: new URLSearchParams({
      grant_type: 'authorization_code',

      client_id: sessionStorage.getItem(
        'tscloak_client_admin_client_id'
      ),

      code,

      redirect_uri: redirectUri,

      code_verifier: sessionStorage.getItem(
        'tscloak_client_admin_code_verifier'
      ),
    }),
  });

  if (!response.ok) {
    throw new Error(
      await response.text()
    );
  }

  const tokens = await response.json();

  const profileResponse = await fetch('/me', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json',
    },
  });

  const profile = profileResponse.ok
    ? await profileResponse.json()
    : null;

  if (
    !profile?.roles?.includes(
      'IDP_CLIENT_ADMIN'
    )
  ) {
    throw new Error(
      'Access denied: IDP_CLIENT_ADMIN role is required for this portal'
    );
  }

  sessionStorage.setItem(
    'tscloak_client_admin_access_token',
    tokens.access_token
  );

  if (tokens.id_token) {
    sessionStorage.setItem(
      'tscloak_client_admin_id_token',
      tokens.id_token
    );
  }

  if (tokens.refresh_token) {
    sessionStorage.setItem(
      'tscloak_client_admin_refresh_token',
      tokens.refresh_token
    );
  }

  sessionStorage.removeItem(
    'tscloak_client_admin_state'
  );

  sessionStorage.removeItem(
    'tscloak_client_admin_code_verifier'
  );

  location.href = './dashboard.html';

})().catch(error => {
  [
    'tscloak_client_admin_access_token',
    'tscloak_client_admin_id_token',
    'tscloak_client_admin_refresh_token',
    'tscloak_client_admin_client_id',
    'tscloak_client_admin_redirect_uri',
    'tscloak_client_admin_post_logout_redirect_uri',
    'tscloak_client_admin_state',
    'tscloak_client_admin_code_verifier',
  ].forEach(key => {
    sessionStorage.removeItem(key);
  });

  status.textContent = error.message;

  console.error(error);
});