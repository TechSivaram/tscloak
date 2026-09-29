(function () {
  "use strict";

  const tokenKey = "tscloak_admin_access_token";
  const userKey = "tscloak_admin_user";

  function token() {
    return sessionStorage.getItem(tokenKey);
  }

  function logout() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem("tscloak_admin_refresh_token");
    sessionStorage.removeItem("tscloak_admin_id_token");
    sessionStorage.removeItem("tscloak_admin_client_id");
    sessionStorage.removeItem("tscloak_admin_post_logout_redirect_uri");
    sessionStorage.removeItem(userKey);
    window.location.href = "/idp-admin/";
  }

  async function apiFetch(url, options = {}) {
    if (!token()) {
      logout();
      return null;
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token()}`);
    headers.set("Accept", "application/json");

    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      logout();
      return null;
    }

    return response;
  }

  function showMessage(message, error = false) {
    const element = document.querySelector("[data-message]");
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error-message", error);
  }

  function setup() {
    if (!token()) {
      window.location.href = "/idp-admin/";
      return;
    }

    verifyIdpAdminRole().then(authorized => {
      if (!authorized) return;
      renderShell();
    });
  }

  /*
   * Defense-in-depth: re-check the IDP_ADMIN role on every admin
   * page load, not just at the login callback, in case a stored
   * token belongs to a user who no longer holds that role.
   */
  async function verifyIdpAdminRole() {
    const cached = JSON.parse(sessionStorage.getItem(userKey) || "null");
    const roles = Array.isArray(cached?.roles) ? cached.roles : null;

    if (roles) {
      if (!roles.includes("IDP_ADMIN")) {
        logout();
        return false;
      }

      return true;
    }

    const response = await apiFetch("/me");
    const user = response && response.ok ? await response.json() : null;

    if (!user?.roles?.includes("IDP_ADMIN")) {
      logout();
      return false;
    }

    sessionStorage.setItem(userKey, JSON.stringify(user));
    return true;
  }

  function renderShell() {
    const user = JSON.parse(sessionStorage.getItem(userKey) || "null");
    const name = "Administrator";

    const nameElement = document.querySelector("[data-user-name]");
    if (nameElement) {
      nameElement.textContent = name;
    }

    ensureSidebarNavigation();
    ensureSidebarFooter();
    normalizeTopbar(name, user);
    loadHeaderProfile();
    setupMobileNavigation();

    document.querySelectorAll("[data-logout]").forEach(button => {
      button.addEventListener("click", logout);
    });

    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "text-button admin-refresh-button";
    refreshButton.textContent = "Refresh";

    refreshButton.addEventListener("click", () => {
      refreshButton.disabled = true;

      document.dispatchEvent(
        new CustomEvent("admin:refresh"),
      );

      window.setTimeout(() => {
        refreshButton.disabled = false;
      }, 800);
    });

    document
      .querySelector(".topbar-actions")
      ?.prepend(refreshButton);

    setupCreateFormCancellation();
  }

  function ensureSidebarNavigation() {
    const navigation = document.querySelector(".sidebar .navigation");

    if (!navigation) return;

    const federationLinks = navigation.querySelectorAll(
      'a.nav-item[href="./federation.html"]',
    );

    let federationLink = federationLinks[0];

    if (!federationLink) {
      federationLink = document.createElement("a");
      federationLink.className = "nav-item";
      federationLink.href = "./federation.html";

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "⇄";

      federationLink.append(
        icon,
        document.createTextNode("Federation"),
      );

      const registrationSection = navigation.querySelector(
        ".nav-section-title",
      );

      navigation.insertBefore(
        federationLink,
        registrationSection || null,
      );
    }

    federationLinks.forEach((link, index) => {
      if (index > 0) {
        link.remove();
      }
    });

    const currentPath = window.location.pathname;

    navigation
      .querySelectorAll("a.nav-item")
      .forEach(link => {
        link.classList.toggle(
          "active",
          new URL(link.href).pathname === currentPath,
        );
      });
  }

  function ensureSidebarFooter() {
    document.querySelectorAll(".sidebar").forEach(sidebar => {
      const existingFooters =
        sidebar.querySelectorAll(".sidebar-footer");

      let footer = existingFooters[0];

      existingFooters.forEach((item, index) => {
        if (index > 0) {
          item.remove();
        }
      });

      if (!footer) {
        footer = document.createElement("div");
        footer.className = "sidebar-footer";

        const status = document.createElement("div");
        status.className = "provider-status";

        const dot = document.createElement("span");
        dot.className = "status-dot";

        const details = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = "Admin Console";

        const subtitle = document.createElement("small");
        subtitle.textContent = "Authenticated session";

        details.append(title, subtitle);
        status.append(dot, details);
        footer.appendChild(status);
      }

      const status = footer.querySelector(".provider-status");

      let title = status?.querySelector("strong");
      let subtitle = status?.querySelector("small");

      if (!status) {
        const card = document.createElement("div");
        card.className = "provider-status";

        footer.replaceChildren(card);

        const dot = document.createElement("span");
        dot.className = "status-dot";

        const details = document.createElement("div");

        title = document.createElement("strong");
        subtitle = document.createElement("small");

        details.append(title, subtitle);
        card.append(dot, details);
      }

      if (title) {
        title.textContent = "Admin Console";
      }

      if (subtitle) {
        subtitle.textContent = "Authenticated session";
      }

      const navigation = sidebar.querySelector(".navigation");

      if (navigation) {
        navigation.after(footer);
      } else {
        sidebar.appendChild(footer);
      }
    });
  }

  function normalizeTopbar(name, user) {
    const topbar = document.querySelector(".topbar");
    const actions = document.querySelector(".topbar-actions");

    if (!topbar || !actions) return;

    if (!document.getElementById("menuButton")) {
      const menuButton = document.createElement("button");

      menuButton.className = "menu-button";
      menuButton.id = "menuButton";
      menuButton.type = "button";
      menuButton.setAttribute(
        "aria-label",
        "Open navigation",
      );
      menuButton.textContent = "☰";

      topbar.insertBefore(
        menuButton,
        topbar.querySelector(".page-heading"),
      );
    }

    if (!actions.querySelector(".profile")) {
      const roleNames = Array.isArray(user?.roles)
        ? user.roles
        : [];

      const roleSummary =
        roleNames.length > 1
          ? `${roleNames[0]} +${roleNames.length - 1} roles`
          : (roleNames[0] || "Administrator");

      const initials =
        name
          .trim()
          .split(/\s+/)
          .map(part => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "AD";

      const fullRoles =
        roleNames.length
          ? roleNames.join(", ")
          : "Administrator";

      actions.innerHTML = `
        <button
          class="icon-button"
          type="button"
          aria-label="Notifications"
        >
          ♢<i></i>
        </button>

        <div
          class="profile"
          title="Roles: ${fullRoles}"
        >
          <div
            class="avatar"
            id="userAvatar"
          >
            ${initials}
          </div>

          <div class="profile-details">
            <strong id="userName">${name}</strong>

            <span
              id="userRole"
              data-role-tooltip="${fullRoles}"
              title="${fullRoles}"
            >
              ${roleSummary}
            </span>
          </div>

          <button
            class="profile-menu-button"
            id="profileMenuButton"
            type="button"
          >
            ▾
          </button>

          <div
            class="profile-menu"
            id="profileMenu"
          >
            <a href="./profile.html">Profile</a>
            <a href="./security.html">Security &amp; MFA</a>
            <button
              type="button"
              id="logoutButton"
            >
              Sign out
            </button>
          </div>
        </div>
      `;

      actions
        .querySelector("#logoutButton")
        .addEventListener("click", logout);

      const profileButton =
        actions.querySelector("#profileMenuButton");

      const profileMenu =
        actions.querySelector("#profileMenu");

      profileButton.addEventListener("click", event => {
        event.stopPropagation();
        profileMenu.classList.toggle("open");
      });

      document.addEventListener("click", () => {
        profileMenu.classList.remove("open");
      });
    }

    /*
     * Existing pages such as dashboard.html already contain
     * the profile menu. Ensure the Security & MFA item is
     * present without replacing the existing menu.
     */
    ensureSecurityMfaMenuItem();

    ensureAvatarMarkup(
      actions.querySelector(".avatar"),
    );
  }

  function ensureSecurityMfaMenuItem() {
    const profileMenu =
      document.getElementById("profileMenu");

    if (!profileMenu) return;

    const existingLink = profileMenu.querySelector(
      'a[href="./security.html"], a[href="/idp-admin/security.html"]',
    );

    if (existingLink) {
      return;
    }

    const securityLink =
      document.createElement("a");

    securityLink.href = "./security.html";
    securityLink.textContent = "Security & MFA";

    const logoutButton =
      profileMenu.querySelector("#logoutButton");

    if (logoutButton) {
      profileMenu.insertBefore(
        securityLink,
        logoutButton,
      );
    } else {
      profileMenu.appendChild(securityLink);
    }
  }

  function initialsFor(name) {
    const parts = String(name || "Administrator")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return parts.length > 1
      ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
      : (parts[0] || "AD")
          .slice(0, 2)
          .toUpperCase();
  }

  function ensureAvatarMarkup(avatar) {
    if (!avatar || avatar.querySelector("img")) {
      return;
    }

    const fallback =
      document.createElement("span");

    fallback.className = "avatar-fallback";
    fallback.id = "userAvatarFallback";
    fallback.textContent =
      avatar.textContent.trim() || "AD";

    const image =
      document.createElement("img");

    image.id = "userAvatarImage";
    image.alt = "";
    image.hidden = true;

    avatar.replaceChildren(
      image,
      fallback,
    );
  }

  function renderHeaderProfile(profile) {
    const displayName =
      profile.displayName ||
      profile.username ||
      "Administrator";

    const roles =
      Array.isArray(profile.roles)
        ? profile.roles
        : [];

    const roleSummary = roles.length
      ? `${roles[0]} · ${roles.length} roles`
      : "Administrator";

    const fullRoles = roles.length
      ? roles.join(", ")
      : "Administrator";

    const name =
      document.getElementById("userName");

    const role =
      document.getElementById("userRole");

    if (name) {
      name.textContent = displayName;
    }

    if (role) {
      role.textContent = roleSummary;
      role.title = fullRoles;
      role.dataset.roleTooltip = fullRoles;
    }

    const image =
      document.getElementById("userAvatarImage");

    const fallback =
      document.getElementById("userAvatarFallback");

    if (!image || !fallback) {
      return;
    }

    const showFallback = () => {
      image.hidden = true;
      image.removeAttribute("src");
      image.onerror = null;

      fallback.textContent =
        initialsFor(displayName);

      fallback.setAttribute(
        "aria-label",
        `${displayName} initials`,
      );

      fallback.hidden = false;
    };

    fallback.hidden = true;
    image.hidden = true;
    image.removeAttribute("src");

    try {
      const url = profile.avatarUrl
        ? new URL(profile.avatarUrl)
        : null;

      if (!url || url.protocol !== "https:") {
        showFallback();
        return;
      }

      image.alt =
        `${displayName} profile picture`;

      image.onerror = showFallback;
      image.src = url.toString();
      image.hidden = false;
    } catch {
      showFallback();
    }
  }

  async function loadHeaderProfile() {
    try {
      const response =
        await apiFetch("/api/account/profile");

      if (response?.ok) {
        renderHeaderProfile(
          await response.json(),
        );
      }
    } catch (error) {
      console.warn(
        "Unable to load account profile for header",
        error,
      );
    }
  }

  function setupMobileNavigation() {
    const button =
      document.getElementById("menuButton");

    const sidebar =
      document.querySelector(".sidebar");

    if (!button || !sidebar) {
      return;
    }

    if (
      document.getElementById("mobileOverlay")
    ) {
      return;
    }

    let overlay =
      document.getElementById("mobileOverlay");

    if (!overlay) {
      overlay =
        document.createElement("div");

      overlay.className = "mobile-overlay";
      overlay.id = "mobileOverlay";

      document.body.appendChild(overlay);
    }

    const close = () => {
      sidebar.classList.remove("open");
      overlay.classList.remove("visible");
    };

    button.addEventListener("click", () => {
      const open =
        sidebar.classList.toggle("open");

      overlay.classList.toggle(
        "visible",
        open,
      );
    });

    overlay.addEventListener(
      "click",
      close,
    );

    sidebar
      .querySelectorAll("a")
      .forEach(link => {
        link.addEventListener("click", close);
      });
  }

  function setupCreateFormCancellation() {
    [
      "clientForm",
      "userForm",
      "roleForm",
    ].forEach(formId => {
      const form =
        document.getElementById(formId);

      if (
        !form ||
        form.querySelector("[data-cancel-form]")
      ) {
        return;
      }

      const submitButton =
        form.querySelector(
          "button[type='submit'], button:not([type])",
        );

      if (!submitButton) {
        return;
      }

      const actions =
        document.createElement("div");

      actions.className = "form-actions";

      submitButton.parentNode.insertBefore(
        actions,
        submitButton,
      );

      actions.appendChild(
        submitButton,
      );

      const cancelButton =
        document.createElement("button");

      cancelButton.type = "button";
      cancelButton.className =
        "button secondary";
      cancelButton.dataset.cancelForm = "true";
      cancelButton.textContent = "Cancel";

      actions.insertBefore(
        cancelButton,
        submitButton,
      );

      cancelButton.addEventListener(
        "click",
        () => {
          form.reset();

          const panel =
            form.closest(".panel");

          if (panel) {
            panel.hidden = true;
          }
        },
      );
    });
  }

  window.Admin = {
    apiFetch,
    showMessage,
  };

  document.addEventListener(
    "DOMContentLoaded",
    setup,
  );

  const pageLoader =
    document.createElement("script");

  pageLoader.src =
    "./js/admin-page-loader.js";

  document.body.appendChild(
    pageLoader,
  );
})();