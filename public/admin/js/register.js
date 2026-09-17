(() => {
  const params = new URLSearchParams(window.location.search);
  const initialToken = params.get('initial_access_token') || params.get('token');
  const form = document.getElementById('registrationForm');
  const notice = document.getElementById('tokenNotice');
  const result = document.getElementById('result');

  if (!initialToken) {
    notice.textContent = 'This registration link is missing its initial access token.';
    notice.classList.add('error');
    form.querySelector('button').disabled = true;
  }

  const values = name => String(new FormData(form).get(name) || '');
  const list = name => values(name).split(/\s*,\s*|\s*\r?\n\s*|\s+/).map(value => value.trim()).filter(Boolean);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!initialToken) return;

    const submit = form.querySelector('button');
    submit.disabled = true;
    result.hidden = true;

    const payload = {
      client_name: values('client_name'),
      redirect_uris: list('redirect_uris'),
      post_logout_redirect_uris: list('post_logout_redirect_uris'),
      scope: values('scope'),
      grant_types: list('grant_types'),
      response_types: list('response_types'),
      token_endpoint_auth_method: values('token_endpoint_auth_method'),
      interaction_mode: values('interaction_mode'),
      interaction_login_url: values('interaction_login_url') || undefined,
      interaction_consent_url: values('interaction_consent_url') || undefined,
    };

    try {
      const response = await fetch('/reg', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${initialToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const body = await response.text();
      let data;
      try { data = JSON.parse(body); } catch { data = { raw: body }; }

      if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Registration failed');
      }

      form.hidden = true;
      notice.hidden = true;
      result.hidden = false;
      result.textContent = `Application registered.\n\nClient ID: ${data.client_id || 'provided by the provider'}\n\n${data.client_secret ? `Client secret: ${data.client_secret}\n\n` : ''}Save these credentials securely. The initial registration token is no longer needed on this page.`;
    } catch (error) {
      result.hidden = false;
      result.classList.add('error');
      result.textContent = error.message;
      submit.disabled = false;
    }
  });
})();
