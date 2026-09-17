const params =
    new URLSearchParams(
        window.location.search
    );

const error =
    params.get('error');

const code =
    params.get('code');

const state =
    params.get('state');

const expectedState =
    sessionStorage.getItem(
        'tscloak_admin_state'
    );

const codeVerifier =
    sessionStorage.getItem(
        'tscloak_admin_code_verifier'
    );

const status =
    document.getElementById('status');

if (error) {

    status.textContent =
        `Authentication failed: ${error}`;

    throw new Error(error);
}

if (!code) {

    status.textContent =
        'Authorization code was not returned.';

    throw new Error(
        'Missing authorization code'
    );
}

if (
    !state ||
    !expectedState ||
    state !== expectedState
) {

    status.textContent =
        'Invalid authentication state.';

    throw new Error(
        'OIDC state mismatch'
    );
}

if (!codeVerifier) {

    status.textContent =
        'PKCE verifier is missing.';

    throw new Error(
        'Missing PKCE code verifier'
    );
}

async function exchangeCode() {

    const clientId =
        sessionStorage.getItem(
            'tscloak_admin_client_id'
        );

    if (!clientId) {
        throw new Error(
            'Admin OIDC client configuration is missing'
        );
    }

    const body =
        new URLSearchParams({
            grant_type:
                'authorization_code',

            client_id:
                clientId,

            code,

            redirect_uri:
                sessionStorage.getItem(
                    'tscloak_admin_redirect_uri'
                ),

            code_verifier:
                codeVerifier,
        });

    const response =
        await fetch('/token', {
            method: 'POST',

            headers: {
                'Content-Type':
                    'application/x-www-form-urlencoded',
            },

            body,
        });

    if (!response.ok) {

        const text =
            await response.text();

        throw new Error(text);
    }

    const tokens =
        await response.json();

    const profileResponse = await fetch('/me', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: 'application/json',
        },
    });

    const profile = profileResponse.ok
        ? await profileResponse.json()
        : null;

    if (!profile?.roles?.includes('IDP_ADMIN')) {
        throw new Error(
            'Access denied: IDP_ADMIN role is required for this portal',
        );
    }

    sessionStorage.setItem(
        'tscloak_admin_access_token',
        tokens.access_token
    );

    if (tokens.id_token) {

        sessionStorage.setItem(
            'tscloak_admin_id_token',
            tokens.id_token
        );
    }

    if (tokens.refresh_token) {

        sessionStorage.setItem(
            'tscloak_admin_refresh_token',
            tokens.refresh_token
        );
    }    

    sessionStorage.removeItem(
        'tscloak_admin_state'
    );

    sessionStorage.removeItem(
        'tscloak_admin_code_verifier'
    );

    sessionStorage.removeItem(
        'tscloak_admin_nonce'
    );

    window.location.href =
        '/admin/dashboard.html';
}

exchangeCode()
    .catch(error => {

        sessionStorage.removeItem('tscloak_admin_access_token');
        sessionStorage.removeItem('tscloak_admin_refresh_token');
        sessionStorage.removeItem('tscloak_admin_id_token');
        sessionStorage.removeItem('tscloak_admin_client_id');
        sessionStorage.removeItem('tscloak_admin_redirect_uri');
        sessionStorage.removeItem('tscloak_admin_state');
        sessionStorage.removeItem('tscloak_admin_code_verifier');
        sessionStorage.removeItem('tscloak_admin_nonce');

        console.error(error);

        status.textContent =
            'Unable to complete authentication.';
    });