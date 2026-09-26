(() => {
  const rows =
    document.getElementById('tokenRows');

  const createTokenButton =
    document.getElementById('createToken');

  const modal =
    document.getElementById('createTokenModal');

  const tokenEmail =
    document.getElementById('tokenEmail');

  const tokenModalMessage =
    document.getElementById('tokenModalMessage');

  const skipCreateTokenButton =
    document.getElementById('skipCreateToken');

  const createAndSendTokenButton =
    document.getElementById('createAndSendToken');

  const closeModalButtons =
    document.querySelectorAll(
      '[data-close-token-modal]'
    );

  async function loadTokens() {
    const response =
      await Admin.apiFetch(
        '/api/admin/initial-access-tokens'
      );

    if (!response || !response.ok) {
      rows.innerHTML =
        '<tr><td colspan="5">Unable to load OIDC tokens.</td></tr>';

      return;
    }

    const tokens =
      await response.json();

    document.getElementById(
      'tokenCount'
    ).textContent =
      `${tokens.length} token${
        tokens.length === 1 ? '' : 's'
      }`;

    rows.innerHTML = tokens.length
      ? tokens
          .map(
            token => `
              <tr>
                <td>
                  <code>${token.id}</code>
                </td>

                <td>
                  ${
                    token.policies.length
                      ? token.policies.join(', ')
                      : 'Default provider policies'
                  }
                </td>

                <td>
                  ${
                    token.expiresAt
                      ? new Date(
                          token.expiresAt
                        ).toLocaleString()
                      : 'No expiry'
                  }
                </td>

                <td>
                  ${new Date(
                    token.createdAt
                  ).toLocaleString()}
                </td>

                <td>
                  <button
                    class="text-button"
                    data-revoke="${token.id}"
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            `
          )
          .join('')
      : `
          <tr>
            <td colspan="5">
              No active OIDC tokens found.
            </td>
          </tr>
        `;

    rows
      .querySelectorAll('[data-revoke]')
      .forEach(button => {
        button.addEventListener(
          'click',
          async () => {
            if (
              !confirm(
                'Revoke this token?'
              )
            ) {
              return;
            }

            const result =
              await Admin.apiFetch(
                `/api/admin/initial-access-tokens/${button.dataset.revoke}`,
                {
                  method: 'DELETE',
                }
              );

            if (result && result.ok) {
              loadTokens();
            } else {
              Admin.showMessage(
                'Unable to revoke token.',
                true
              );
            }
          }
        );
      });
  }

  function openCreateTokenModal() {
    tokenEmail.value = '';

    tokenModalMessage.hidden = true;
    tokenModalMessage.textContent = '';
    tokenModalMessage.className =
      'token-modal-message';

    skipCreateTokenButton.disabled = false;
    createAndSendTokenButton.disabled = false;

    modal.hidden = false;

    tokenEmail.focus();
  }

  function closeCreateTokenModal() {
    modal.hidden = true;
  }

  function showModalError(message) {
    tokenModalMessage.textContent = message;

    tokenModalMessage.className =
      'token-modal-message error';

    tokenModalMessage.hidden = false;
  }

  async function createToken(email = null) {
    skipCreateTokenButton.disabled = true;
    createAndSendTokenButton.disabled = true;

    const originalSkipText =
      skipCreateTokenButton.textContent;

    const originalSendText =
      createAndSendTokenButton.textContent;

    if (email) {
      createAndSendTokenButton.textContent =
        'Creating & Sending...';
    } else {
      skipCreateTokenButton.textContent =
        'Creating...';
    }

    try {
      const body = email
        ? { email }
        : {};

      const response =
        await Admin.apiFetch(
          '/api/admin/initial-access-tokens',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );

      if (response && response.ok) {
        const data =
          await response.json();

        closeCreateTokenModal();

        const result =
          document.getElementById(
            'tokenResult'
          );

        const token =
          data.token;

        const link =
          `${window.location.origin}` +
          `/idp-admin/register.html` +
          `?initial_access_token=` +
          `${encodeURIComponent(token)}`;

        result.hidden = false;

        result.textContent =
          `Registration link:\n${link}` +
          `\n\nInitial access token:\n${token}`;

        if (email) {
          Admin.showMessage(
            `Registration token created and sent to ${email}.`
          );
        } else {
          Admin.showMessage(
            'Registration token created.'
          );
        }

        loadTokens();

        return;
      }

      if (response) {
        let errorMessage =
          'Unable to create token.';

        try {
          const error =
            await response.json();

          if (Array.isArray(error.message)) {
            errorMessage =
              error.message.join(', ');
          } else if (error.message) {
            errorMessage =
              error.message;
          }
        } catch {
          // Keep default error message.
        }

        showModalError(errorMessage);
      }
    } catch {
      showModalError(
        'Unable to create token.'
      );
    } finally {
      skipCreateTokenButton.disabled = false;
      createAndSendTokenButton.disabled = false;

      skipCreateTokenButton.textContent =
        originalSkipText;

      createAndSendTokenButton.textContent =
        originalSendText;
    }
  }

  function init() {
    loadTokens();

    document.addEventListener(
      'admin:refresh',
      loadTokens
    );

    createTokenButton.addEventListener(
      'click',
      openCreateTokenModal
    );

    skipCreateTokenButton.addEventListener(
      'click',
      () => {
        createToken();
      }
    );

    createAndSendTokenButton.addEventListener(
      'click',
      () => {
        const email =
          tokenEmail.value.trim();

        if (!email) {
          showModalError(
            'Enter an email address to send the token.'
          );

          tokenEmail.focus();

          return;
        }

        if (!tokenEmail.checkValidity()) {
          showModalError(
            'Enter a valid email address.'
          );

          tokenEmail.focus();

          return;
        }

        createToken(email);
      }
    );

    closeModalButtons.forEach(
      button => {
        button.addEventListener(
          'click',
          closeCreateTokenModal
        );
      }
    );

    document.addEventListener(
      'keydown',
      event => {
        if (
          event.key === 'Escape' &&
          !modal.hidden
        ) {
          closeCreateTokenModal();
        }
      }
    );
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init
    );
  } else {
    init();
  }
})();