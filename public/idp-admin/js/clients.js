(() => {
  const rows = document.getElementById('clientRows');
  const formPanel = document.getElementById('clientFormPanel');
  const form = document.getElementById('clientForm');
  const submitButton = form.querySelector('button[type="submit"]');
  const actions = form.querySelector('.form-actions');
  let editingClientId = null;

  /**
   * Escape untrusted values before inserting them into HTML.
   *
   * This is required because client name, client ID, redirect URIs,
   * and interaction mode can originate from administrator-controlled
   * or potentially untrusted data.
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Add client status field dynamically.
  // Use DOM APIs instead of innerHTML.
  const statusLabel = document.createElement('label');
  statusLabel.textContent = 'Client status';

  const statusSelect = document.createElement('select');
  statusSelect.name = 'enabled';

  const enabledOption = document.createElement('option');
  enabledOption.value = 'true';
  enabledOption.textContent = 'Enabled';

  const disabledOption = document.createElement('option');
  disabledOption.value = 'false';
  disabledOption.textContent = 'Disabled';

  statusSelect.append(enabledOption, disabledOption);
  statusLabel.appendChild(statusSelect);

  form.insertBefore(statusLabel, actions || submitButton);

  function setClientFormMode(editing) {
    submitButton.textContent = editing ? 'Update client' : 'Create client';
  }

  async function loadClients() {
    const response = await Admin.apiFetch('/api/admin/clients');

    if (!response || !response.ok) {
      rows.innerHTML =
        '<tr><td colspan="6">Unable to load clients.</td></tr>';
      return;
    }

    const clients = await response.json();

    rows.innerHTML = clients.length
      ? clients
          .map((client) => {
            /*
             * Escape every value that is inserted into innerHTML.
             *
             * Never trust values returned from the API just because
             * they were originally entered through the admin UI.
             */
            const clientId = escapeHtml(client.clientId);
            const clientName = escapeHtml(client.name);
            const interactionMode = escapeHtml(client.interactionMode);

            const redirectUris = Array.isArray(client.redirectUris)
              ? client.redirectUris
                  .map((uri) => escapeHtml(uri))
                  .join('<br>')
              : '';

            return `
              <tr>
                <td>${clientName}</td>
                <td><code>${clientId}</code></td>
                <td>${redirectUris}</td>
                <td>${interactionMode}</td>
                <td>${client.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>
                  <button
                    class="text-button"
                    data-edit="${clientId}"
                  >
                    Edit
                  </button>
                  <button
                    class="text-button"
                    data-delete="${clientId}"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            `;
          })
          .join('')
      : '<tr><td colspan="6">No clients registered.</td></tr>';

    rows.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Delete this client?')) {
          return;
        }

        const clientId = button.dataset.delete;

        const result = await Admin.apiFetch(
          `/api/admin/clients/${encodeURIComponent(clientId)}`,
          {
            method: 'DELETE',
          },
        );

        if (result && result.ok) {
          loadClients();
        } else {
          Admin.showMessage('Unable to delete client.', true);
        }
      });
    });

    rows.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const client = clients.find(
          (item) => item.clientId === button.dataset.edit,
        );

        if (!client) {
          return;
        }

        editingClientId = client.clientId;

        form.elements.name.value = client.name;
        form.elements.redirectUris.value = client.redirectUris.join('\n');
        form.elements.postLogoutRedirectUris.value = (
          client.postLogoutRedirectUris || []
        ).join('\n');
        form.elements.allowedScopes.value =
          client.allowedScopes.join(' ');
        form.elements.grantTypes.value = client.grantTypes.join(' ');
        form.elements.responseTypes.value =
          client.responseTypes.join(' ');
        form.elements.tokenEndpointAuthMethod.value =
          client.tokenEndpointAuthMethod;
        form.elements.interactionMode.value =
          client.interactionMode;
        form.elements.interactionLoginUrl.value =
          client.interactionLoginUrl || '';
        form.elements.interactionConsentUrl.value =
          client.interactionConsentUrl || '';
        form.elements.enabled.value = String(client.enabled);

        setClientFormMode(true);

        formPanel.hidden = false;
        formPanel.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    });
  }

  function init() {
    loadClients();

    document.addEventListener('admin:refresh', loadClients);

    document
      .getElementById('showClientForm')
      .addEventListener('click', () => {
        editingClientId = null;
        form.reset();
        setClientFormMode(false);
        formPanel.hidden = !formPanel.hidden;
      });

    const interactionMode =
      document.getElementById('interactionMode');

    const interactionFields =
      document.querySelectorAll('.interaction-field');

    const updateInteractionFields = () => {
      const external = interactionMode.value === 'external';

      interactionFields.forEach((field) => {
        field.hidden = !external;
      });
    };

    interactionMode.addEventListener(
      'change',
      updateInteractionFields,
    );

    updateInteractionFields();

    form.addEventListener('reset', () => {
      editingClientId = null;
      setClientFormMode(false);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const formData = new FormData(event.target);

      const get = (name) => formData.get(name);

      const list = (name) =>
        String(get(name) || '')
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter(Boolean);

      const payload = {
        name: get('name'),

        redirectUris: list('redirectUris'),

        postLogoutRedirectUris: list(
          'postLogoutRedirectUris',
        ),

        allowedScopes: String(get('allowedScopes') || '')
          .split(/\s+/)
          .filter(Boolean),

        grantTypes: String(get('grantTypes') || '')
          .split(/\s+/)
          .filter(Boolean),

        responseTypes: String(get('responseTypes') || '')
          .split(/\s+/)
          .filter(Boolean),

        tokenEndpointAuthMethod: get(
          'tokenEndpointAuthMethod',
        ),

        interactionMode: get('interactionMode'),

        interactionLoginUrl:
          get('interactionLoginUrl') || undefined,

        interactionConsentUrl:
          get('interactionConsentUrl') || undefined,

        enabled: get('enabled') === 'true',
      };

      const url = editingClientId
        ? `/api/admin/clients/${encodeURIComponent(
            editingClientId,
          )}`
        : '/api/admin/clients';

      const result = await Admin.apiFetch(url, {
        method: editingClientId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (result && result.ok) {
        formPanel.hidden = true;
        event.target.reset();
        loadClients();
      } else {
        Admin.showMessage(
          editingClientId
            ? 'Unable to update client.'
            : 'Unable to create client.',
          true,
        );
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();