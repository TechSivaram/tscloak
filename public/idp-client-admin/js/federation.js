(() => {
  const rows = document.getElementById('providerRows');
  const message = document.getElementById('federationMessage');
  let providers = [];

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadProviders() {
    rows.innerHTML = '<tr><td colspan="4">Loading providers...</td></tr>';
    const response = await ClientAdmin.api('/api/federation/client/providers');
    if (!response || !response.ok) {
      rows.innerHTML =
        '<tr><td colspan="4">Unable to load federation providers.</td></tr>';
      return;
    }

    providers = await response.json();
    rows.innerHTML = providers.length
      ? providers
          .map(
            (provider) => `
          <tr>
            <td>${escapeHtml(provider.name)}</td>
            <td>${escapeHtml(provider.type)}</td>
            <td>${provider.availableGlobally ? (provider.enabled ? 'Enabled for this client' : 'Disabled for this client') : 'Disabled globally'}</td>
            <td><button class="refresh" data-toggle="${escapeHtml(provider.id)}" ${provider.availableGlobally ? '' : 'disabled'}>${provider.enabled ? 'Disable for client' : 'Enable for client'}</button></td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="4">No federation providers are configured.</td></tr>';

    rows.querySelectorAll('[data-toggle]').forEach((button) => {
      button.addEventListener('click', () =>
        toggleProvider(button.dataset.toggle),
      );
    });
  }

  async function toggleProvider(id) {
    const provider = providers.find((item) => item.id === id);
    if (!provider || !provider.availableGlobally) return;

    const response = await ClientAdmin.api(
      `/api/federation/client/providers/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !provider.enabled }),
      },
    );
    if (response?.ok) {
      message.textContent = 'Provider availability updated for this client.';
      loadProviders();
    } else {
      message.textContent = 'Unable to update provider availability.';
    }
  }

  document
    .getElementById('refreshFederation')
    .addEventListener('click', loadProviders);
  loadProviders();
})();
