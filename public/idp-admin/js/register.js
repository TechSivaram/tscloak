(() => {
  const params = new URLSearchParams(window.location.search);

  const initialToken =
    params.get('initial_access_token') ||
    params.get('token');

  const form =
    document.getElementById('registrationForm');

  const notice =
    document.getElementById('tokenNotice');

  const result =
    document.getElementById('result');


  /*
   * Validate registration invitation token
   */
  if (!initialToken) {
    notice.textContent =
      'This registration link is missing its initial access token.';

    notice.classList.add('error');

    form.querySelector('button').disabled = true;

    return;
  }


  /*
   * Read a form value
   */
  const values = name =>
    String(
      new FormData(form).get(name) || ''
    );


  /*
   * Convert comma / newline / space separated
   * values into an array.
   */
  const list = name =>
    values(name)
      .split(
        /\s*,\s*|\s*\r?\n\s*|\s+/
      )
      .map(value => value.trim())
      .filter(Boolean);


  /*
   * Registration
   */
  form.addEventListener(
    'submit',
    async event => {

      event.preventDefault();

      if (!initialToken) {
        return;
      }


      const submit =
        form.querySelector('button');


      submit.disabled = true;

      result.hidden = true;

      result.classList.remove('error');


      /*
       * Build Dynamic Client Registration payload
       */
      const payload = {

        client_name:
          values('client_name'),

        redirect_uris:
          list('redirect_uris'),

        post_logout_redirect_uris:
          list('post_logout_redirect_uris'),

        scope:
          values('scope'),

        grant_types:
          list('grant_types'),

        response_types:
          list('response_types'),

        token_endpoint_auth_method:
          values(
            'token_endpoint_auth_method'
          ),

        interaction_mode:
          values('interaction_mode'),

        interaction_login_url:
          values('interaction_login_url') ||
          undefined,

        interaction_consent_url:
          values('interaction_consent_url') ||
          undefined,
      };


      try {

        /*
         * Send registration request to TSCloak
         */
        const response =
          await fetch(
            '/reg',
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${initialToken}`,

                'Content-Type':
                  'application/json',

                Accept:
                  'application/json',
              },

              body:
                JSON.stringify(payload),
            }
          );


        /*
         * Read provider response
         */
        const body =
          await response.text();


        let data;

        try {
          data = JSON.parse(body);
        } catch {
          data = {
            raw: body,
          };
        }


        /*
         * Handle registration failure
         */
        if (!response.ok) {
          throw new Error(
            data.error_description ||
            data.error ||
            'Registration failed'
          );
        }


        /*
         * Client ID returned by TSCloak
         */
        const clientId =
          data.client_id;


        /*
         * Build Client Administration URL
         *
         * Example:
         *
         * http://localhost:3000/
         * idp-client-admin/
         * <clientId>
         *
         */
        const clientAdminUrl =
          clientId
            ? `${window.location.origin}` +
              `/idp-client-admin/` +
              `${encodeURIComponent(clientId)}`
            : null;


        /*
         * Hide registration form
         */
        form.hidden = true;

        notice.hidden = true;

        result.hidden = false;


        /*
         * Build successful registration message
         */
        let message =
          'Application registered.\n\n';


        message +=
          `Client ID: ${
            clientId ||
            'provided by the provider'
          }\n\n`;


        /*
         * Client Administration URL
         */
        if (clientAdminUrl) {

          message +=
            'Client Administration URL:\n';

          message +=
            `${clientAdminUrl}\n\n`;
        }


        /*
         * Client secret
         */
        if (data.client_secret) {

          message +=
            `Client secret: ${
              data.client_secret
            }\n\n`;
        }


        message +=
          'Save these credentials securely. ' +
          'The initial registration token is no longer needed on this page.';


        result.textContent =
          message;


      } catch (error) {

        /*
         * Display registration error
         */
        result.hidden = false;

        result.classList.add('error');

        result.textContent =
          error.message;


        submit.disabled = false;
      }
    }
  );
})();