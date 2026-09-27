(() => {
  const key = 'tscloak_client_admin_access_token';
  const token = () => sessionStorage.getItem(key);
  const logout = () => {
    const params = new URLSearchParams();
    const idToken = sessionStorage.getItem('tscloak_client_admin_id_token');
    const clientId = sessionStorage.getItem('tscloak_client_admin_client_id');
    const redirectUri =
      sessionStorage.getItem('tscloak_client_admin_post_logout_redirect_uri') ||
      `${window.location.origin}/idp-client-admin/`;
    params.set('post_logout_redirect_uri', redirectUri);
    if (clientId) params.set('client_id', clientId);
    if (idToken) params.set('id_token_hint', idToken);
    location.href = `/session/end?${params.toString()}`;
  };

  async function api(url, options = {}) {
    if (!token()) {
      logout();
      return null;
    }
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token()}`);
    headers.set('Accept', 'application/json');
    if (options.body) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) logout();
    return response;
  }

  async function loadMe() {
    const response = await api('/api/account/profile');
    if (!response || !response.ok) return null;
    const profile = await response.json();
    const name = profile.displayName || profile.username || 'Administrator';
    const roles = Array.isArray(profile.roles) ? profile.roles : [];
    const roleSummary = roles.length
      ? `${roles[0]} · ${roles.length} roles`
      : 'IDP_CLIENT_ADMIN';

    document.querySelectorAll('.user-chip').forEach((chip) => {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      const initials = parts.length > 1
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : (parts[0] || 'AD').slice(0, 2).toUpperCase();
      chip.replaceChildren();
      chip.title = `Roles: ${roles.length ? roles.join(', ') : 'IDP_CLIENT_ADMIN'}`;

      const avatar = document.createElement('span');
      avatar.className = 'header-avatar';
      const image = document.createElement('img');
      image.className = 'header-avatar-image';
      image.alt = '';
      image.hidden = true;
      const fallback = document.createElement('span');
      fallback.className = 'header-avatar-fallback';
      fallback.textContent = initials;
      fallback.setAttribute('role', 'img');
      fallback.setAttribute('aria-label', `${name} initials`);
      avatar.append(image, fallback);

      const identity = document.createElement('span');
      identity.className = 'header-identity';
      const nameNode = document.createElement('strong');
      nameNode.textContent = name;
      const roleNode = document.createElement('small');
      roleNode.textContent = roleSummary;
      identity.append(nameNode, roleNode);

      const menuButton = document.createElement('button');
      menuButton.className = 'header-profile-button';
      menuButton.type = 'button';
      menuButton.setAttribute('aria-label', 'Open profile menu');
      menuButton.textContent = '⌄';
      const menu = document.createElement('span');
      menu.className = 'header-profile-menu';
      const profileLink = document.createElement('a');
      profileLink.href = './profile.html';
      profileLink.textContent = 'Profile';
      const logoutButton = document.createElement('button');
      logoutButton.type = 'button';
      logoutButton.dataset.headerLogout = '';
      logoutButton.textContent = 'Sign out';
      menu.append(profileLink, logoutButton);
      chip.append(avatar, identity, menuButton, menu);

      const showFallback = () => {
        image.hidden = true;
        image.removeAttribute('src');
        image.onerror = null;
        fallback.hidden = false;
      };
      fallback.hidden = true;
      try {
        const url = profile.avatarUrl ? new URL(profile.avatarUrl) : null;
        if (!url || url.protocol !== 'https:') showFallback();
        else {
          image.alt = `${name} profile picture`;
          image.onerror = showFallback;
          image.src = url.toString();
          image.hidden = false;
        }
      } catch {
        showFallback();
      }

      menuButton.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.classList.toggle('open');
      });
      logoutButton.addEventListener('click', logout);
      document.addEventListener('click', () => menu.classList.remove('open'));
    });
    return profile;
  }

  document
    .querySelectorAll('[data-logout]')
    .forEach((button) => button.addEventListener('click', logout));
  function ensureSidebarNavigation() {
    document.querySelectorAll('.sidebar nav').forEach((nav) => {
      const getOrCreateLink = (href, label) => {
        const matchingLinks = Array.from(nav.querySelectorAll(`a[href="${href}"]`));
        const link = matchingLinks.shift() || document.createElement('a');
        matchingLinks.forEach((duplicate) => duplicate.remove());
        if (!link.hasAttribute('href')) {
          link.href = href;
          link.textContent = label;
        }
        return link;
      };

      const dashboardLink = getOrCreateLink('./dashboard.html', 'Dashboard');
      const usersLink = getOrCreateLink('./users.html', 'Users');
      const settingsLink = getOrCreateLink('./settings.html', 'Client settings');
      const federationLink = getOrCreateLink('./federation.html', 'Federation');
      const profileLink = getOrCreateLink('./profile.html', 'Profile');

      nav.prepend(dashboardLink);
      dashboardLink.after(usersLink);
      usersLink.after(settingsLink);
      settingsLink.after(federationLink);
      federationLink.after(profileLink);

      nav.querySelectorAll('a[href$=".html"]').forEach((link) => {
        link.classList.toggle(
          'active',
          new URL(link.getAttribute('href'), window.location.href).pathname ===
            window.location.pathname,
        );
      });
    });
  }

  ensureSidebarNavigation();
  window.ClientAdmin = { api, loadMe, logout };
  loadMe().catch((error) => console.warn('Unable to load account profile for header', error));
})();
