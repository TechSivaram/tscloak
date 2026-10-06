(() => {
  const rows = document.getElementById('clientRows');
  const formPanel = document.getElementById('clientFormPanel');
  const form = document.getElementById('clientForm');
  const submitButton = form.querySelector('button[type="submit"]');
  const actions = form.querySelector('.form-actions');
  const secretPanel = document.getElementById('clientSecretPanel');
  const generatedClientSecret = document.getElementById('generatedClientSecret');
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
        const standardScopes = new Set(['openid', 'profile', 'email', 'offline_access', 'roles', 'scim']);
        const standardGrantTypes = new Set(['authorization_code', 'refresh_token', 'client_credentials']);
        const allowedScopes = client.allowedScopes || [];
        const grantTypes = client.grantTypes || [];
        form.querySelectorAll('[name="allowedScopeOptions"]').forEach((checkbox) => {
          checkbox.checked = allowedScopes.includes(checkbox.value);
        });
        form.elements.additionalScopes.value = allowedScopes
          .filter((scope) => !standardScopes.has(scope))
          .join(' ');
        form.querySelectorAll('[name="grantTypeOptions"]').forEach((checkbox) => {
          checkbox.checked = grantTypes.includes(checkbox.value);
        });
        form.elements.additionalGrantTypes.value = grantTypes
          .filter((grantType) => !standardGrantTypes.has(grantType))
          .join(' ');
        form.elements.responseTypes.value =
          client.responseTypes.join(' ');
        form.elements.jwksUri.value = client.jwksUri || '';
        const authMethods = new Set(client.tokenEndpointAuthMethods || ['none']);
        form.querySelectorAll('[name="tokenEndpointAuthMethods"]').forEach(
          (checkbox) => { checkbox.checked = authMethods.has(checkbox.value); },
        );
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
        form.querySelectorAll('[name="allowedScopeOptions"]').forEach((checkbox) => {
          checkbox.checked = ['openid', 'profile', 'email'].includes(checkbox.value);
        });
        form.querySelectorAll('[name="grantTypeOptions"]').forEach((checkbox) => {
          checkbox.checked = ['authorization_code', 'refresh_token'].includes(checkbox.value);
        });
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

        allowedScopes: [
          ...formData.getAll('allowedScopeOptions'),
          ...String(get('additionalScopes') || '')
            .split(/\s+/)
            .filter(Boolean),
        ].filter((value, index, values) => values.indexOf(value) === index),

        grantTypes: [
          ...formData.getAll('grantTypeOptions'),
          ...String(get('additionalGrantTypes') || '')
            .split(/\s+/)
            .filter(Boolean),
        ].filter((value, index, values) => values.indexOf(value) === index),

        responseTypes: String(get('responseTypes') || '')
          .split(/\s+/)
          .filter(Boolean),

        tokenEndpointAuthMethods: formData.getAll('tokenEndpointAuthMethods'),

        jwksUri: get('jwksUri') || undefined,

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
        const data = await result.json();
        if (data.clientSecret) {
          generatedClientSecret.textContent = data.clientSecret;
          secretPanel.hidden = false;
        }
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
