(() => {
  async function loadProfile() {
    const response = await Admin.apiFetch('/me');
    if (!response || !response.ok) {
      Admin.showMessage('Unable to load profile.', true);
      return;
    }

    const user = await response.json();
    const name = user.name || user.preferred_username || user.username || 'Administrator';
    document.getElementById('profileName').textContent = name;
    document.getElementById('profileUsername').textContent = user.preferred_username || user.username || '—';
    document.getElementById('profileEmail').textContent = user.email || '—';
    document.getElementById('profileRoles').textContent = Array.isArray(user.roles) && user.roles.length ? user.roles.join(', ') : '—';
    document.getElementById('profileClient').textContent = user.clientId || '—';
  }

  function init() {
    loadProfile();
    document.addEventListener('admin:refresh', loadProfile);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
