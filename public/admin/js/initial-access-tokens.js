(() => {
  const rows = document.getElementById('tokenRows');

  async function loadTokens() {
    const response = await Admin.apiFetch('/api/admin/initial-access-tokens');
    if (!response || !response.ok) { rows.innerHTML = '<tr><td colspan="5">Unable to load OIDC tokens.</td></tr>'; return; }
    const tokens = await response.json();
    document.getElementById('tokenCount').textContent = `${tokens.length} token${tokens.length === 1 ? '' : 's'}`;
    rows.innerHTML = tokens.length ? tokens.map(token => `<tr><td><code>${token.id}</code></td><td>${token.policies.length ? token.policies.join(', ') : 'Default provider policies'}</td><td>${token.expiresAt ? new Date(token.expiresAt).toLocaleString() : 'No expiry'}</td><td>${new Date(token.createdAt).toLocaleString()}</td><td><button class="text-button" data-revoke="${token.id}">Revoke</button></td></tr>`).join('') : '<tr><td colspan="5">No active OIDC tokens found.</td></tr>';
    rows.querySelectorAll('[data-revoke]').forEach(button => button.addEventListener('click', async () => { if (!confirm('Revoke this token?')) return; const result = await Admin.apiFetch(`/api/admin/initial-access-tokens/${button.dataset.revoke}`, { method: 'DELETE' }); if (result && result.ok) loadTokens(); else Admin.showMessage('Unable to revoke token.', true); }));
  }

  function init() {
    loadTokens();
    document.getElementById('createToken').addEventListener('click', async () => { const response = await Admin.apiFetch('/api/admin/initial-access-tokens', { method: 'POST' }); if (response && response.ok) { const data = await response.json(); const result = document.getElementById('tokenResult'); result.hidden = false; result.textContent = data.token || JSON.stringify(data, null, 2); Admin.showMessage('Token created. Copy it now; it may not be shown again.'); loadTokens(); } else if (response) Admin.showMessage('Unable to create token.', true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
