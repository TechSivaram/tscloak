(async () => {
  const form = document.getElementById('settingsForm');
  const message = document.getElementById('message');
  const list = name => String(new FormData(form).get(name) || '').split(/\r?\n|,|\s+/).map(value => value.trim()).filter(Boolean);

  async function load() {
    const response = await ClientAdmin.api('/api/client-admin/settings');
    if (!response || !response.ok) { message.textContent = 'Unable to load client settings.'; return; }
    const client = await response.json();
    document.getElementById('settingsTitle').textContent = client.name;
    form.elements.name.value = client.name;
    form.elements.redirectUris.value = client.redirectUris.join('\n');
    form.elements.postLogoutRedirectUris.value = client.postLogoutRedirectUris.join('\n');
    form.elements.allowedScopes.value = client.allowedScopes.join(' ');
    form.elements.grantTypes.value = client.grantTypes.join(' ');
    form.elements.responseTypes.value = client.responseTypes.join(' ');
    form.elements.tokenEndpointAuthMethod.value = client.tokenEndpointAuthMethod;
    form.elements.interactionMode.value = client.interactionMode;
    form.elements.interactionLoginUrl.value = client.interactionLoginUrl || '';
    form.elements.interactionConsentUrl.value = client.interactionConsentUrl || '';
  }

  await load();
  document.getElementById('cancelSettings').onclick = load;
  form.onsubmit = async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const response = await ClientAdmin.api('/api/client-admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        name: values.name,
        redirectUris: list('redirectUris'),
        postLogoutRedirectUris: list('postLogoutRedirectUris'),
        allowedScopes: list('allowedScopes'),
        grantTypes: list('grantTypes'),
        responseTypes: list('responseTypes'),
        tokenEndpointAuthMethod: values.tokenEndpointAuthMethod,
        interactionMode: values.interactionMode,
        interactionLoginUrl: values.interactionLoginUrl || undefined,
        interactionConsentUrl: values.interactionConsentUrl || undefined,
      }),
    });
    message.textContent = response && response.ok ? 'Client settings saved.' : 'Unable to save client settings.';
    if (response && response.ok) load();
  };
})();
