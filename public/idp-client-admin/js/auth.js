async function login() {
    /*
     * The client-admin portal is multi-tenant: the clientId is
     * supplied via the URL path (/idp-client-admin/{clientId}/)
     * instead of being resolved from callback URLs (which are
     * ambiguous across tenants).
     */
    const pathSegments = window.location.pathname
        .split("/")
        .filter(Boolean);

    const clientId =
        pathSegments[0] === "idp-client-admin"
            ? pathSegments[1]
            : undefined;

    if (!clientId) {
        throw new Error(
            "Missing clientId in the page URL",
        );
    }

    const configResponse = await fetch(
        `/api/admin/config/oidc?portal=idp-client-admin&clientId=${encodeURIComponent(
            clientId,
        )}`,
    );

    if (!configResponse.ok) {
        throw new Error(
            "Client administration login is not configured",
        );
    }

    const config = await configResponse.json();

    const redirectUri = config.redirectUri;

    if (!config.clientId) {
        throw new Error(
            "OIDC client ID is missing from configuration",
        );
    }

    if (!redirectUri) {
        throw new Error(
            "OIDC redirect URI is missing from configuration",
        );
    }

    /*
     * Generate cryptographically secure random values using
     * rejection sampling to avoid modulo bias.
     */
    const random = (length) => {
        const characters =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

        const result = [];

        const maxValidValue =
            256 -
            (256 % characters.length);

        while (result.length < length) {
            const bytes = new Uint8Array(length);

            crypto.getRandomValues(bytes);

            for (const byte of bytes) {
                if (byte >= maxValidValue) {
                    continue;
                }

                result.push(
                    characters[
                        byte % characters.length
                    ],
                );

                if (result.length === length) {
                    break;
                }
            }
        }

        return result.join("");
    };

    /*
     * PKCE
     */
    const verifier = random(64);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
    );

    const challenge = btoa(
        String.fromCharCode(
            ...new Uint8Array(digest),
        ),
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    /*
     * OAuth state protects the authorization response
     * against CSRF / authorization-response injection.
     */
    const state = random(32);

    /*
     * OIDC nonce binds the ID token to this authentication
     * transaction. The callback MUST validate this value.
     */
    const nonce = random(32);

    sessionStorage.setItem(
        "tscloak_client_admin_code_verifier",
        verifier,
    );

    sessionStorage.setItem(
        "tscloak_client_admin_state",
        state,
    );

    sessionStorage.setItem(
        "tscloak_client_admin_nonce",
        nonce,
    );

    sessionStorage.setItem(
        "tscloak_client_admin_client_id",
        config.clientId,
    );

    sessionStorage.setItem(
        "tscloak_client_admin_redirect_uri",
        redirectUri,
    );

    if (config.postLogoutRedirectUri) {
        sessionStorage.setItem(
            "tscloak_client_admin_post_logout_redirect_uri",
            config.postLogoutRedirectUri,
        );
    }

    /*
     * Store issuer when supplied by the server.
     *
     * The callback can use this to validate the ID token issuer.
     */
    if (config.issuer) {
        sessionStorage.setItem(
            "tscloak_client_admin_issuer",
            config.issuer,
        );
    }

    const params = new URLSearchParams({
        client_id: config.clientId,

        redirect_uri: redirectUri,

        response_type: "code",

        scope: "openid profile email roles",

        state,

        nonce,

        code_challenge: challenge,

        code_challenge_method: "S256",
    });

    window.location.href =
        `/auth?${params.toString()}`;
}

document
    .getElementById("loginButton")
    .addEventListener("click", () =>
        login().catch((error) => {
            /*
             * Do not inject the error through innerHTML.
             * textContent safely renders it as text.
             */
            document.getElementById(
                "loginError",
            ).textContent =
                error instanceof Error
                    ? error.message
                    : "Unable to start authentication.";
        }),
    );