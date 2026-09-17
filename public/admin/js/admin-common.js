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

    document.querySelectorAll("[data-logout]").forEach(button => {
      button.addEventListener("click", logout);
    });

    setupCreateFormCancellation();
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
