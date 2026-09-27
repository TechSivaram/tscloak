(() => {
  const rows = document.getElementById('providerRows');
  const panel = document.getElementById('providerFormPanel');
  const form = document.getElementById('providerForm');
  const submit = form.querySelector('button[type="submit"]');
  let providers = [];
  let editingId = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function loadProviders() {
    rows.innerHTML = '<tr><td colspan="7">Loading providers...</td></tr>';
    const response = await Admin.apiFetch('/api/federation/providers');
    if (!response || !response.ok) {
      rows.innerHTML =
        '<tr><td colspan="7">Unable to load federation providers.</td></tr>';
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
            <td>${escapeHtml(provider.issuer)}</td>
            <td><code>${escapeHtml(provider.clientId)}</code></td>
            <td>${escapeHtml(Array.isArray(provider.scopes) ? provider.scopes.join(', ') : '')}</td>
            <td>${provider.enabled ? 'Enabled' : 'Disabled'}</td>
            <td class="provider-actions">
              <button class="text-button" data-edit="${escapeHtml(provider.id)}">Edit</button>
              <button class="text-button" data-toggle="${escapeHtml(provider.id)}">${provider.enabled ? 'Disable' : 'Enable'}</button>
              <button class="text-button" data-delete="${escapeHtml(provider.id)}">Delete</button>
            </td>
          </tr>`,
          )
          .join('')
      : '<tr><td colspan="7">No federation providers configured.</td></tr>';

    rows.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => openEdit(button.dataset.edit));
    });
    rows.querySelectorAll('[data-toggle]').forEach((button) => {
      button.addEventListener('click', () =>
        toggleProvider(button.dataset.toggle),
      );
    });
    rows.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', () =>
        deleteProvider(button.dataset.delete),
      );
    });
  }

  function openCreate() {
    editingId = null;
    form.reset();
    form.elements.type.value = 'oidc';
    form.elements.enabled.value = 'true';
    form.elements.clientSecret.required = true;
    document.getElementById('providerFormTitle').textContent =
      'Add federation provider';
    document.getElementById('secretHelp').textContent =
      'Required when creating a provider.';
    submit.textContent = 'Create provider';
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function openEdit(id) {
    const provider = providers.find((item) => item.id === id);
    if (!provider) return;
    editingId = id;
    form.elements.name.value = provider.name;
    form.elements.type.value = provider.type;
    form.elements.issuer.value = provider.issuer;
    form.elements.clientId.value = provider.clientId;
    form.elements.clientSecret.value = '';
    form.elements.clientSecret.required = false;
    form.elements.scopes.value = Array.isArray(provider.scopes)
      ? provider.scopes.join(' ')
      : '';
    form.elements.enabled.value = String(provider.enabled);
    document.getElementById('providerFormTitle').textContent =
      `Edit ${provider.name}`;
    document.getElementById('secretHelp').textContent =
      'Leave blank to keep the current secret.';
    submit.textContent = 'Save changes';
    panel.hidden = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeForm() {
    form.reset();
    editingId = null;
    panel.hidden = true;
  }

  async function toggleProvider(id) {
    const provider = providers.find((item) => item.id === id);
    if (!provider) return;
    const response = await Admin.apiFetch(
      `/api/federation/providers/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !provider.enabled }),
      },
    );
    if (response?.ok) {
      Admin.showMessage(
        `Provider ${provider.enabled ? 'disabled' : 'enabled'}.`,
      );
      loadProviders();
    } else {
      Admin.showMessage('Unable to update provider status.', true);
    }
  }

  async function deleteProvider(id) {
    const provider = providers.find((item) => item.id === id);
    if (
      !provider ||
      !window.confirm(
        `Delete ${provider.name}? Federated identities linked to this provider will also be removed.`,
      )
    )
      return;
    const response = await Admin.apiFetch(
      `/api/federation/providers/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
    if (response?.ok) {
      Admin.showMessage('Federation provider deleted.');
      loadProviders();
    } else {
      Admin.showMessage('Unable to delete federation provider.', true);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const payload = {
      name: values.get('name').trim(),
      type: values.get('type'),
      issuer: values.get('issuer').trim(),
      clientId: values.get('clientId').trim(),
      scopes: String(values.get('scopes') || '')
        .split(/[\s,]+/)
        .filter(Boolean),
      enabled: values.get('enabled') === 'true',
    };
    const secret = String(values.get('clientSecret') || '').trim();
    if (!editingId || secret) payload.clientSecret = secret;

    const response = await Admin.apiFetch(
      editingId
        ? `/api/federation/providers/${encodeURIComponent(editingId)}`
        : '/api/federation/providers',
      {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      },
    );
    if (response?.ok) {
      Admin.showMessage(
        editingId
          ? 'Federation provider updated.'
          : 'Federation provider created.',
      );
      closeForm();
      loadProviders();
    } else {
      Admin.showMessage('Unable to save federation provider.', true);
    }
  });

  document
    .getElementById('showProviderForm')
    .addEventListener('click', openCreate);
  document
    .getElementById('cancelProviderForm')
    .addEventListener('click', closeForm);
  document.addEventListener('admin:refresh', loadProviders);
  loadProviders();
})();
