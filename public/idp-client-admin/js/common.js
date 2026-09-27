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
      nav.classList.add('navigation');
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

      const icons = {
        './dashboard.html': '⌂',
        './users.html': '♙',
        './settings.html': '⚙',
        './federation.html': '⇄',
        './profile.html': '◉',
      };
      nav.querySelectorAll('a[href$=".html"]').forEach((link) => {
        link.classList.add('nav-item');
        let icon = link.querySelector('span');
        if (!icon) {
          icon = document.createElement('span');
          icon.setAttribute('aria-hidden', 'true');
          icon.textContent = icons[link.getAttribute('href')] || '•';
          link.insertBefore(icon, link.firstChild);
        }
        link.classList.toggle(
          'active',
          new URL(link.getAttribute('href'), window.location.href).pathname ===
            window.location.pathname,
        );
      });
    });
  }

  function ensureSidebarBrandAndFooter() {
    document.querySelectorAll('.sidebar').forEach((sidebar) => {
      const brand = sidebar.querySelector('.brand');
      const logo = brand?.querySelector('img');
      if (brand && logo && !brand.querySelector('.brand-mark')) {
        const mark = document.createElement('div');
        mark.className = 'brand-mark';
        mark.appendChild(logo);
        const details = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'brand-name';
        name.textContent = 'TSCloak';
        const subtitle = document.createElement('div');
        subtitle.className = 'brand-subtitle';
        subtitle.textContent = 'Client Administration';
        details.append(name, subtitle);
        brand.replaceChildren(mark, details);
      }

      const signouts = Array.from(sidebar.querySelectorAll('.signout'));
      const signout = signouts.shift();
      signouts.forEach((duplicate) => duplicate.remove());
      if (!signout) return;

      let footer = sidebar.querySelector('.sidebar-footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'sidebar-footer';
      }
      footer.appendChild(signout);
      sidebar.appendChild(footer);
    });
  }

  function setupResponsiveNavigation() {
    const sidebar = document.querySelector('.sidebar');
    const header = document.querySelector('.main-area > header');
    if (!sidebar || !header) return;

    sidebar.id = 'clientAdminSidebar';
    let button = header.querySelector('.menu-button');
    if (!button) {
      button = document.createElement('button');
      button.className = 'menu-button';
      button.type = 'button';
      button.setAttribute('aria-label', 'Open navigation');
      button.setAttribute('aria-controls', sidebar.id);
      button.setAttribute('aria-expanded', 'false');
      button.textContent = '☰';
      header.insertBefore(button, header.firstChild);
    }

    let overlay = document.querySelector('.mobile-overlay');
    if (!overlay) {
      overlay = document.createElement('button');
      overlay.className = 'mobile-overlay';
      overlay.type = 'button';
      overlay.setAttribute('aria-label', 'Close navigation');
      document.body.appendChild(overlay);
    }

    const close = () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open navigation');
    };
    button.addEventListener('click', () => {
      const open = !sidebar.classList.contains('open');
      sidebar.classList.toggle('open', open);
      overlay.classList.toggle('visible', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    });
    overlay.addEventListener('click', close);
    sidebar.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 760) close();
    });
  }

  ensureSidebarNavigation();
  ensureSidebarBrandAndFooter();
  setupResponsiveNavigation();
  window.ClientAdmin = { api, loadMe, logout };
  loadMe().catch((error) => console.warn('Unable to load account profile for header', error));
})();
