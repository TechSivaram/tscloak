(() => {
  const key = 'client_admin_access_token';
  const token = () => sessionStorage.getItem(key);
  const logout = () => {
    const params = new URLSearchParams();
    const idToken = sessionStorage.getItem('client_admin_id_token');
    const clientId = sessionStorage.getItem('client_admin_client_id');
    const redirectUri = sessionStorage.getItem('client_admin_post_logout_redirect_uri') || `${window.location.origin}/idp-client-admin/`;

    params.set('post_logout_redirect_uri', redirectUri);
    if (clientId) params.set('client_id', clientId);
    if (idToken) params.set('id_token_hint', idToken);

    sessionStorage.removeItem(key);
    sessionStorage.removeItem('client_admin_refresh_token');
    sessionStorage.removeItem('client_admin_id_token');
    sessionStorage.removeItem('client_admin_client_id');
    sessionStorage.removeItem('client_admin_redirect_uri');
    sessionStorage.removeItem('client_admin_post_logout_redirect_uri');
    location.href = `/session/end?${params.toString()}`;
  };
  async function api(url, options = {}) { if (!token()) { logout(); return null; } const headers = new Headers(options.headers || {}); headers.set('Authorization', `Bearer ${token()}`); headers.set('Accept', 'application/json'); if (options.body) headers.set('Content-Type', 'application/json'); const response = await fetch(url, { ...options, headers }); if (response.status === 401 || response.status === 403) logout(); return response; }
  async function loadMe() {
    const response = await api('/me');
    if (!response || !response.ok) return null;
    const user = await response.json();
    const name = user.name || user.preferred_username || user.username || 'Administrator';
    const roles = Array.isArray(user.roles) ? user.roles : [];
    const roleSummary = roles.length > 1 ? `${roles[0]} +${roles.length - 1} roles` : (roles[0] || 'IDP_CLIENT_ADMIN');
    document.querySelectorAll('[data-user-name]').forEach(node => node.textContent = name);
    document.querySelectorAll('[data-user-role]').forEach(node => node.textContent = roleSummary);

    document.querySelectorAll('.user-chip').forEach(chip => {
      const initials = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'AD';
      chip.title = `Roles: ${roles.length ? roles.join(', ') : 'IDP_CLIENT_ADMIN'}`;
      chip.innerHTML = `<span class="header-avatar">${initials}</span><span class="header-identity"><strong>${name}</strong><small>${roleSummary}</small></span><button class="header-profile-button" type="button" aria-label="Open profile menu">⌄</button><span class="header-profile-menu"><a href="./profile.html">Profile</a><button type="button" data-header-logout>Sign out</button></span>`;
      const menuButton = chip.querySelector('.header-profile-button');
      const menu = chip.querySelector('.header-profile-menu');
      menuButton.addEventListener('click', event => { event.stopPropagation(); menu.classList.toggle('open'); });
      chip.querySelector('[data-header-logout]').addEventListener('click', logout);
      document.addEventListener('click', () => menu.classList.remove('open'));
    });
    return user;
  }
  document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', logout));
  document.querySelectorAll('.sidebar nav').forEach(nav => { if (!nav.querySelector('a[href="./settings.html"]')) { const link = document.createElement('a'); link.href = './settings.html'; link.textContent = 'Client settings'; nav.insertBefore(link, nav.lastElementChild); } });
  window.ClientAdmin = { api, loadMe, logout };
  loadMe();
})();
