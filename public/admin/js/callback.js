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

    const body =
        new URLSearchParams({
            grant_type:
                'authorization_code',

            client_id:
                '04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363',

            code,

            redirect_uri:
                `${window.location.origin}/admin/callback.html`,

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

        console.error(error);

        status.textContent =
            'Unable to complete authentication.';
    });