async function login() {
    /*
     * The client-admin portal is multi-tenant: the clientId is
     * supplied via the URL path (/client-admin/{clientId}/) instead
     * of being resolved from callback URLs (which are ambiguous
     * across tenants).
     */
    const pathSegments = window.location.pathname.split("/").filter(Boolean);
    const clientId = pathSegments[0] === "client-admin" ? pathSegments[1] : undefined;

    if (!clientId) {
        throw new Error("Missing clientId in the page URL");
    }

    const configResponse = await fetch(
        `/api/admin/config/oidc?portal=client-admin&clientId=${encodeURIComponent(clientId)}`
    );

    if (!configResponse.ok) {
        throw new Error("Client administration login is not configured");
    }

    const config = await configResponse.json();
    const redirectUri = config.redirectUri;

    const random = (length) => {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);

        return Array.from(
            bytes,
            (byte) =>
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[
                    byte % 66
                ]
        ).join("");
    };

    const verifier = random(64);

    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier)
    );

    const challenge = btoa(
        String.fromCharCode(...new Uint8Array(digest))
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const state = random(32);

    sessionStorage.setItem("client_admin_code_verifier", verifier);
    sessionStorage.setItem("client_admin_state", state);
    sessionStorage.setItem("client_admin_client_id", config.clientId);
    sessionStorage.setItem("client_admin_redirect_uri", redirectUri);

    if (config.postLogoutRedirectUri) {
        sessionStorage.setItem(
            "client_admin_post_logout_redirect_uri",
            config.postLogoutRedirectUri
        );
    }

    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid profile email roles",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
    });

    window.location.href = `/auth?${params}`;
}

document
    .getElementById("loginButton")
    .addEventListener("click", () =>
        login().catch((error) => {
            document.getElementById("loginError").textContent = error.message;
        })
    );