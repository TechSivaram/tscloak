(async () => {
  const form = document.getElementById('settingsForm');
  const message = document.getElementById('message');
  const standardScopes = new Set(['openid', 'profile', 'email', 'offline_access', 'roles', 'scim']);
  const standardGrantTypes = new Set(['authorization_code', 'refresh_token', 'client_credentials']);

  const list = name => String(new FormData(form).get(name) || '')
    .split(/\r?\n|,|\s+/)
    .map(value => value.trim())
    .filter(Boolean);

  const selected = name => new FormData(form).getAll(name);

  function setOptions(name, values, standardValues) {
    const set = new Set(values || []);
    form.querySelectorAll(`[name="${name}"]`).forEach(checkbox => {
      checkbox.checked = set.has(checkbox.value);
    });
    return (values || []).filter(value => !standardValues.has(value)).join(' ');
  }

  function enforceScimDependency() {
    const scim = form.querySelector('[name="allowedScopeOptions"][value="scim"]');
    const clientCredentials = form.querySelector('[name="grantTypeOptions"][value="client_credentials"]');
    if (scim?.checked && clientCredentials) {
      clientCredentials.checked = true;
    }
  }

  async function load() {
    const response = await ClientAdmin.api('/api/client-admin/settings');
    if (!response || !response.ok) { message.textContent = 'Unable to load client settings.'; return; }
    const client = await response.json();
    document.getElementById('settingsTitle').textContent = client.name;
    form.elements.name.value = client.name;
    form.elements.redirectUris.value = client.redirectUris.join('\n');
    form.elements.postLogoutRedirectUris.value = client.postLogoutRedirectUris.join('\n');

    form.elements.additionalScopes.value = setOptions('allowedScopeOptions', client.allowedScopes || [], standardScopes);
    form.elements.additionalGrantTypes.value = setOptions('grantTypeOptions', client.grantTypes || [], standardGrantTypes);
    form.elements.responseTypes.value = client.responseTypes.join(' ');
    form.elements.jwksUri.value = client.jwksUri || '';

    const authMethods = new Set(client.tokenEndpointAuthMethods || ['none']);
    form.querySelectorAll('[name="tokenEndpointAuthMethods"]').forEach(checkbox => {
      checkbox.checked = authMethods.has(checkbox.value);
    });

    form.elements.interactionMode.value = client.interactionMode;
    form.elements.interactionLoginUrl.value = client.interactionLoginUrl || '';
    form.elements.interactionConsentUrl.value = client.interactionConsentUrl || '';
    enforceScimDependency();
  }

  form.querySelectorAll('[name="allowedScopeOptions"]').forEach(checkbox => {
    checkbox.addEventListener('change', enforceScimDependency);
  });

  await load();
  document.getElementById('cancelSettings').onclick = load;

  form.onsubmit = async event => {
    event.preventDefault();
    enforceScimDependency();

    const formData = new FormData(form);
    const response = await ClientAdmin.api('/api/client-admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        name: formData.get('name'),
        redirectUris: list('redirectUris'),
        postLogoutRedirectUris: list('postLogoutRedirectUris'),
        allowedScopes: [
          ...selected('allowedScopeOptions'),
          ...list('additionalScopes'),
        ].filter((value, index, values) => values.indexOf(value) === index),
        grantTypes: [
          ...selected('grantTypeOptions'),
          ...list('additionalGrantTypes'),
        ].filter((value, index, values) => values.indexOf(value) === index),
        responseTypes: list('responseTypes'),
        tokenEndpointAuthMethods: formData.getAll('tokenEndpointAuthMethods'),
        jwksUri: formData.get('jwksUri') || undefined,
        interactionMode: formData.get('interactionMode'),
        interactionLoginUrl: formData.get('interactionLoginUrl') || undefined,
        interactionConsentUrl: formData.get('interactionConsentUrl') || undefined,
      }),
    });
    if (response && response.ok) {
      const data = await response.json();
      message.textContent = data.clientSecret
        ? `Client settings saved. New client secret: ${data.clientSecret}`
        : 'Client settings saved.';
      load();
    } else {
      message.textContent = 'Unable to save client settings.';
    }
  };
})();
