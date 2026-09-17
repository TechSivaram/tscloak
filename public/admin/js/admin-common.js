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
    window.location.href = "/admin/";
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
      window.location.href = "/admin/";
      return;
    }

    const user = JSON.parse(sessionStorage.getItem(userKey) || "null");
    const name = user?.name || user?.preferred_username || user?.username || "Administrator";
    const nameElement = document.querySelector("[data-user-name]");
    if (nameElement) nameElement.textContent = name;

    normalizeTopbar(name, user);
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
      document.dispatchEvent(new CustomEvent("admin:refresh"));
      window.setTimeout(() => { refreshButton.disabled = false; }, 800);
    });
    document.querySelector(".topbar-actions")?.prepend(refreshButton);

    setupCreateFormCancellation();
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
      menuButton.setAttribute("aria-label", "Open navigation");
      menuButton.textContent = "☰";
      topbar.insertBefore(menuButton, topbar.querySelector(".page-heading"));
    }

    if (!actions.querySelector(".profile")) {
      const roleNames = Array.isArray(user?.roles) ? user.roles : [];
      const roleSummary = roleNames.length > 1
        ? `${roleNames[0]} +${roleNames.length - 1} roles`
        : (roleNames[0] || "Administrator");
      const initials = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || "AD";
      const fullRoles = roleNames.length ? roleNames.join(", ") : "Administrator";
      actions.innerHTML = `<button class="icon-button" type="button" aria-label="Notifications">♢<i></i></button><div class="profile" title="Roles: ${fullRoles}"><div class="avatar" id="userAvatar">${initials}</div><div class="profile-details"><strong id="userName">${name}</strong><span id="userRole" data-role-tooltip="${fullRoles}" title="${fullRoles}">${roleSummary}</span></div><button class="profile-menu-button" id="profileMenuButton" type="button">▾</button><div class="profile-menu" id="profileMenu"><a href="./profile.html">Profile</a><button type="button" id="logoutButton">Sign out</button></div></div>`;
      actions.querySelector("#logoutButton").addEventListener("click", logout);
      const profileButton = actions.querySelector("#profileMenuButton");
      const profileMenu = actions.querySelector("#profileMenu");
      profileButton.addEventListener("click", event => { event.stopPropagation(); profileMenu.classList.toggle("open"); });
      document.addEventListener("click", () => profileMenu.classList.remove("open"));
    }
  }

  function setupMobileNavigation() {
    const button = document.getElementById("menuButton");
    const sidebar = document.querySelector(".sidebar");
    if (!button || !sidebar) return;

    if (document.getElementById("mobileOverlay")) return;

    let overlay = document.getElementById("mobileOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "mobile-overlay";
      overlay.id = "mobileOverlay";
      document.body.appendChild(overlay);
    }

    const close = () => { sidebar.classList.remove("open"); overlay.classList.remove("visible"); };
    button.addEventListener("click", () => { const open = sidebar.classList.toggle("open"); overlay.classList.toggle("visible", open); });
    overlay.addEventListener("click", close);
    sidebar.querySelectorAll("a").forEach(link => link.addEventListener("click", close));
  }

  function setupCreateFormCancellation() {
    ["clientForm", "userForm", "roleForm"].forEach(formId => {
      const form = document.getElementById(formId);
      if (!form || form.querySelector("[data-cancel-form]")) return;

      const submitButton = form.querySelector(
        "button[type='submit'], button:not([type])",
      );
      if (!submitButton) return;

      const actions = document.createElement("div");
      actions.className = "form-actions";
      submitButton.parentNode.insertBefore(actions, submitButton);
      actions.appendChild(submitButton);

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "button secondary";
      cancelButton.dataset.cancelForm = "true";
      cancelButton.textContent = "Cancel";
      actions.insertBefore(cancelButton, submitButton);

      cancelButton.addEventListener("click", () => {
        form.reset();
        const panel = form.closest(".panel");
        if (panel) panel.hidden = true;
      });
    });
  }

  window.Admin = { apiFetch, showMessage };
  document.addEventListener("DOMContentLoaded", setup);

  const pageLoader = document.createElement("script");
  pageLoader.src = "./js/admin-page-loader.js";
  document.body.appendChild(pageLoader);
})();
