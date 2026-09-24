(async () => {
  const user = await ClientAdmin.loadMe();
  if (!user) return;
  document.getElementById('username').textContent =
    user.preferred_username || user.username || '—';
  document.getElementById('email').textContent = user.email || '—';
  document.getElementById('roles').textContent = user.roles?.join(', ') || '—';
  document.getElementById('client').textContent = user.clientId || '—';
})();
