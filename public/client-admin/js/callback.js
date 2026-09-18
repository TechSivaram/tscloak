const params = new URLSearchParams(location.search);

const status = document.getElementById("status");

const redirectUri =
    sessionStorage.getItem(
        "client_admin_redirect_uri"
    );

const code =
    params.get("code");

const state =
    params.get("state");


/*
 * Validate authorization code and state.
 */
if (
    !code ||
    state !==
        sessionStorage.getItem(
            "client_admin_state"
        )
) {
    status.textContent =
        "Authentication failed. Invalid callback state.";

    throw new Error(
        "Invalid client admin callback"
    );
}


/*
 * Exchange authorization code for tokens.
 */
(async () => {

    const response =
        await fetch("/token", {

            method: "POST",

            headers: {
                "Content-Type":
                    "application/x-www-form-urlencoded"
            },

            body: new URLSearchParams({

                grant_type:
                    "authorization_code",

                client_id:
                    sessionStorage.getItem(
                        "client_admin_client_id"
                    ),

                code:
                    code,

                redirect_uri:
                    redirectUri,

                code_verifier:
                    sessionStorage.getItem(
                        "client_admin_code_verifier"
                    )
            })
        });


    /*
     * Token request failed.
     */
    if (!response.ok) {

        throw new Error(
            await response.text()
        );
    }


    /*
     * Read tokens.
     */
    const tokens =
        await response.json();


    /*
     * Load authenticated user profile.
     */
    const profileResponse =
        await fetch("/me", {

            headers: {

                Authorization:
                    `Bearer ${tokens.access_token}`,

                Accept:
                    "application/json"
            }
        });


    const profile =
        profileResponse.ok
            ? await profileResponse.json()
            : null;


    /*
     * Client Administration Portal
     * requires IDP_CLIENT_ADMIN.
     */
    if (
        !profile?.roles?.includes(
            "IDP_CLIENT_ADMIN"
        )
    ) {
        throw new Error(
            "Access denied: IDP_CLIENT_ADMIN role is required for this portal"
        );
    }


    /*
     * Store authentication tokens.
     */
    sessionStorage.setItem(
        "client_admin_access_token",
        tokens.access_token
    );


    if (tokens.id_token) {

        sessionStorage.setItem(
            "client_admin_id_token",
            tokens.id_token
        );
    }


    if (tokens.refresh_token) {

        sessionStorage.setItem(
            "client_admin_refresh_token",
            tokens.refresh_token
        );
    }


    /*
     * Authentication completed.
     *
     * Remove temporary PKCE state.
     */
    sessionStorage.removeItem(
        "client_admin_state"
    );

    sessionStorage.removeItem(
        "client_admin_code_verifier"
    );


    /*
     * Go to the dashboard.
     */
    location.href =
        "./dashboard.html";


})().catch(error => {

    /*
     * Clear all Client Administration
     * authentication/session state.
     */
    [
        "client_admin_access_token",
        "client_admin_id_token",
        "client_admin_refresh_token",
        "client_admin_client_id",
        "client_admin_redirect_uri",
        "client_admin_post_logout_redirect_uri",
        "client_admin_state",
        "client_admin_code_verifier"
    ].forEach(
        key =>
            sessionStorage.removeItem(key)
    );


    /*
     * Display authentication error.
     */
    status.textContent =
        error.message;


    console.error(
        error
    );
});