(function () {
    "use strict";

    const ACCESS_TOKEN_KEY =
        "tscloak_admin_access_token";

    const USER_KEY =
        "tscloak_admin_user";

    const $ = (selector) =>
        document.querySelector(selector);


    /*
     * Get the access token created by callback.js
     */
    function getAccessToken() {

        return sessionStorage.getItem(
            ACCESS_TOKEN_KEY
        );
    }


    /*
     * Redirect to login if there is no access token.
     */
    function requireAuthentication() {

        const accessToken =
            getAccessToken();

        if (!accessToken) {

            window.location.href =
                "/admin/";

            return false;
        }

        return true;
    }


    /*
     * Get user information stored in session.
     */
    function getStoredUser() {

        try {

            const value =
                sessionStorage.getItem(
                    USER_KEY
                );

            return value
                ? JSON.parse(value)
                : null;

        } catch {

            return null;
        }
    }


    /*
     * Store user information in session.
     */
    function storeUser(user) {

        sessionStorage.setItem(
            USER_KEY,
            JSON.stringify(user)
        );
    }


    /*
     * Get initials for the avatar.
     */
    function getInitials(name) {

        if (!name) {
            return "AD";
        }

        const parts =
            String(name)
                .trim()
                .split(/\s+/)
                .filter(Boolean);

        if (parts.length === 1) {

            return parts[0]
                .substring(0, 2)
                .toUpperCase();
        }

        return (
            parts[0][0] +
            parts[parts.length - 1][0]
        ).toUpperCase();
    }


    /*
     * Call the OIDC UserInfo endpoint.
     *
     * Your TSCloak provider exposes /me.
     */
    async function loadCurrentUser() {

        const accessToken =
            getAccessToken();

        if (!accessToken) {
            return null;
        }

        try {

            const response =
                await fetch("/me", {

                    method: "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${accessToken}`,

                        "Accept":
                            "application/json"
                    }
                });


            /*
             * Access token expired or invalid.
             */
            if (response.status === 401) {

                logout();

                return null;
            }


            if (!response.ok) {

                throw new Error(
                    `Unable to load user information: ${response.status}`
                );
            }


            const user =
                await response.json();


            storeUser(user);

            return user;

        } catch (error) {

            console.error(
                "Unable to load current user:",
                error
            );

            return getStoredUser();
        }
    }


    /*
     * Display user information.
     */
    function displayUser(user) {

        if (!user) {
            return;
        }


        const name =
            user.name ||
            user.preferred_username ||
            user.username ||
            "Administrator";


        const roles =
            Array.isArray(user.roles)
                ? user.roles
                : [];


        const primaryRole =
            roles.length > 0
                ? roles[0]
                : "Administrator";


        const userName =
            $("#userName");

        const welcomeName =
            $("#welcomeName");

        const userAvatar =
            $("#userAvatar");

        const userRole =
            $("#userRole");


        if (userName) {

            userName.textContent =
                name;
        }


        if (welcomeName) {

            welcomeName.textContent =
                name;
        }


        if (userAvatar) {

            userAvatar.textContent =
                getInitials(name);
        }


        if (userRole) {

            userRole.textContent =
                primaryRole;
        }
    }


    /*
     * Common authenticated API helper.
     */
    async function apiFetch(
        url,
        options = {}
    ) {

        const accessToken =
            getAccessToken();


        if (!accessToken) {

            logout();

            return null;
        }


        const headers =
            new Headers(
                options.headers || {}
            );


        if (!headers.has("Accept")) {

            headers.set(
                "Accept",
                "application/json"
            );
        }


        if (
            options.body &&
            !headers.has("Content-Type")
        ) {

            headers.set(
                "Content-Type",
                "application/json"
            );
        }


        headers.set(
            "Authorization",
            `Bearer ${accessToken}`
        );


        const response =
            await fetch(url, {

                ...options,

                headers
            });


        if (response.status === 401) {

            logout();

            return null;
        }


        return response;
    }


    /*
     * Logout.
     */
    function logout() {

        const idToken =
            sessionStorage.getItem(
                "tscloak_admin_id_token"
            );

        const params =
            new URLSearchParams();

        params.set(
            "post_logout_redirect_uri",
            `${window.location.origin}/admin/`
        );

        params.set(
            "client_id",
            "04d26513a9de6faa2dff7aaa4ba05582d16ed23ff8b03363"
        );

        if (idToken) {
            params.set(
                "id_token_hint",
                idToken
            );
        }

        /*
         * Clear local Admin UI state.
         */
        sessionStorage.removeItem(
            "tscloak_admin_access_token"
        );

        sessionStorage.removeItem(
            "tscloak_admin_refresh_token"
        );

        sessionStorage.removeItem(
            "tscloak_admin_id_token"
        );

        sessionStorage.removeItem(
            "tscloak_admin_user"
        );

        /*
         * End the TSCloak OIDC session.
         */
        window.location.href =
            `/session/end?${params.toString()}`;
    }


    /*
     * Profile menu.
     */
    function setupProfileMenu() {

        const button =
            $("#profileMenuButton");

        const menu =
            $("#profileMenu");


        if (!button || !menu) {
            return;
        }


        button.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();

                menu.classList.toggle(
                    "open"
                );
            }
        );


        document.addEventListener(
            "click",
            () => {

                menu.classList.remove(
                    "open"
                );
            }
        );


        menu.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();
            }
        );
    }


    /*
     * Logout button.
     */
    function setupLogout() {

        const button =
            $("#logoutButton");


        if (!button) {
            return;
        }


        button.addEventListener(
            "click",
            logout
        );
    }


    /*
     * Mobile sidebar.
     */
    function setupMobileNavigation() {

        const button =
            $("#menuButton");

        const sidebar =
            $("#sidebar");

        const overlay =
            $("#mobileOverlay");


        if (
            !button ||
            !sidebar ||
            !overlay
        ) {
            return;
        }


        function closeMenu() {

            sidebar.classList.remove(
                "open"
            );

            overlay.classList.remove(
                "visible"
            );

            button.setAttribute(
                "aria-expanded",
                "false"
            );
        }


        button.addEventListener(
            "click",
            () => {

                const open =
                    sidebar.classList.toggle(
                        "open"
                    );


                overlay.classList.toggle(
                    "visible",
                    open
                );


                button.setAttribute(
                    "aria-expanded",
                    String(open)
                );
            }
        );


        overlay.addEventListener(
            "click",
            closeMenu
        );


        sidebar
            .querySelectorAll("a")
            .forEach((link) => {

                link.addEventListener(
                    "click",
                    closeMenu
                );
            });
    }


    /*
     * Refresh button.
     */
    function setupRefresh() {

        const button =
            $("#refreshActivity");


        if (!button) {
            return;
        }


        button.addEventListener(
            "click",
            async () => {

                button.disabled = true;

                button.textContent =
                    "Refreshing...";


                try {

                    await loadDashboard();

                } finally {

                    button.disabled = false;

                    button.textContent =
                        "Refresh";
                }
            }
        );
    }


    /*
     * Dashboard data.
     *
     * We will connect this to the actual
     * TSCloak Admin APIs next.
     */
    async function loadDashboard() {

        /*
         * Example when the dashboard API
         * is implemented:
         *
         * const response =
         *     await apiFetch(
         *         "/api/admin/dashboard"
         *     );
         *
         * if (!response) {
         *     return;
         * }
         *
         * const data =
         *     await response.json();
         *
         * setCount(
         *     "#clientCount",
         *     data.clients
         * );
         *
         * setCount(
         *     "#userCount",
         *     data.users
         * );
         *
         * setCount(
         *     "#tokenCount",
         *     data.initialAccessTokens
         * );
         *
         * setCount(
         *     "#roleCount",
         *     data.roles
         * );
         */
    }


    function setCount(
        selector,
        value
    ) {

        const element =
            $(selector);


        if (!element) {
            return;
        }


        element.textContent =
            value === null ||
                value === undefined
                ? "—"
                : String(value);
    }


    /*
     * Initialize dashboard.
     */
    async function initialize() {

        /*
         * First make sure the callback
         * has established a session.
         */
        if (!requireAuthentication()) {
            return;
        }


        /*
         * Load the current authenticated
         * user from /me.
         */
        const user =
            await loadCurrentUser();


        if (!user) {
            return;
        }


        /*
         * Display name and roles.
         */
        displayUser(user);


        /*
         * Setup UI.
         */
        setupProfileMenu();

        setupLogout();

        setupMobileNavigation();

        setupRefresh();


        /*
         * Load dashboard information.
         */
        await loadDashboard();
    }


    document.addEventListener(
        "DOMContentLoaded",
        initialize
    );

})();