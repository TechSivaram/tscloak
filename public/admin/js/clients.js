(() => {
  const rows = document.getElementById('clientRows');
  const formPanel = document.getElementById('clientFormPanel');
  const form = document.getElementById('clientForm');
  const submitButton = form.querySelector('button[type="submit"]');
  const actions = form.querySelector('.form-actions');
  let editingClientId = null;

  const portalLabel = document.createElement('label');
  portalLabel.innerHTML = 'Portal classification<select name="portalType"><option value="none">Standard client</option><option value="admin">IDP Admin Portal</option><option value="client-admin">Client Admin Portal</option></select>';
  form.insertBefore(portalLabel, actions || submitButton);

  const statusLabel = document.createElement('label');
  statusLabel.innerHTML = 'Client status<select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>';
  form.insertBefore(statusLabel, actions || submitButton);

  function setClientFormMode(editing) {
    document.querySelector('#clientFormPanel h3').textContent = editing ? 'Edit client' : 'Register client';
    submitButton.textContent = editing ? 'Save changes' : 'Create client';
  }

  async function loadClients() {
    const response = await Admin.apiFetch('/api/admin/clients');
    if (!response || !response.ok) {
      rows.innerHTML = '<tr><td colspan="6">Unable to load clients.</td></tr>';
      return;
    }
    const clients = await response.json();
    rows.innerHTML = clients.length
      ? clients.map(client => `<tr><td>${client.name}</td><td><code>${client.clientId}</code></td><td>${client.redirectUris.join('<br>')}</td><td>${client.interactionMode}</td><td>${client.enabled ? 'Enabled' : 'Disabled'}</td><td><button class="text-button" data-edit="${client.clientId}">Edit</button><button class="text-button" data-delete="${client.clientId}">Delete</button></td></tr>`).join('')
      : '<tr><td colspan="6">No clients registered.</td></tr>';
    rows.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this client?')) return;
      const result = await Admin.apiFetch(`/api/admin/clients/${button.dataset.delete}`, { method: 'DELETE' });
      if (result && result.ok) loadClients(); else Admin.showMessage('Unable to delete client.', true);
    }));
    rows.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
      const client = clients.find(item => item.clientId === button.dataset.edit);
      if (!client) return;
      editingClientId = client.clientId;
      form.elements.name.value = client.name;
      form.elements.portalType.value = client.portalType || 'none';
      form.elements.redirectUris.value = client.redirectUris.join('\n');
      form.elements.postLogoutRedirectUris.value = (client.postLogoutRedirectUris || []).join('\n');
      form.elements.allowedScopes.value = client.allowedScopes.join(' ');
      form.elements.grantTypes.value = client.grantTypes.join(' ');
      form.elements.responseTypes.value = client.responseTypes.join(' ');
      form.elements.tokenEndpointAuthMethod.value = client.tokenEndpointAuthMethod;
      form.elements.interactionMode.value = client.interactionMode;
      form.elements.interactionLoginUrl.value = client.interactionLoginUrl || '';
      form.elements.interactionConsentUrl.value = client.interactionConsentUrl || '';
      form.elements.enabled.value = String(client.enabled);
      setClientFormMode(true);
      formPanel.hidden = false;
      formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function init() {
    loadClients();
    document.addEventListener('admin:refresh', loadClients);
    document.getElementById('showClientForm').addEventListener('click', () => { editingClientId = null; form.reset(); setClientFormMode(false); formPanel.hidden = !formPanel.hidden; });
    const interactionMode = document.getElementById('interactionMode');
    const interactionFields = document.querySelectorAll('.interaction-field');
    const updateInteractionFields = () => {
      const external = interactionMode.value === 'external';
      interactionFields.forEach(field => { field.hidden = !external; });
    };
    interactionMode.addEventListener('change', updateInteractionFields);
    updateInteractionFields();
    form.addEventListener('reset', () => { editingClientId = null; setClientFormMode(false); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.target);
      const get = name => form.get(name);
      const list = name => String(get(name) || '').split(/\r?\n|,/).map(value => value.trim()).filter(Boolean);
      const payload = {
        name: get('name'), redirectUris: list('redirectUris'),
        portalType: get('portalType'),
        postLogoutRedirectUris: list('postLogoutRedirectUris'),
        allowedScopes: get('allowedScopes').split(/\s+/).filter(Boolean),
        grantTypes: get('grantTypes').split(/\s+/).filter(Boolean),
        responseTypes: get('responseTypes').split(/\s+/).filter(Boolean),
        tokenEndpointAuthMethod: get('tokenEndpointAuthMethod'),
        interactionMode: get('interactionMode'),
        interactionLoginUrl: get('interactionLoginUrl') || undefined,
        interactionConsentUrl: get('interactionConsentUrl') || undefined,
        enabled: get('enabled') === 'true',
      };
      const url = editingClientId ? `/api/admin/clients/${editingClientId}` : '/api/admin/clients';
      const result = await Admin.apiFetch(url, { method: editingClientId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      if (result && result.ok) { formPanel.hidden = true; event.target.reset(); loadClients(); }
      else Admin.showMessage(editingClientId ? 'Unable to update client.' : 'Unable to create client.', true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
