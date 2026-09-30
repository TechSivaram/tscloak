(() => {
  const isClientAdmin = window.location.pathname.includes('/idp-client-admin/');

  const api = (url, options) =>
    isClientAdmin
      ? window.ClientAdmin.api(url, options)
      : window.Admin.apiFetch(url, options);

  const $ = (id) => document.getElementById(id);

  let recoveryCodes = [];
  let confirmAction = null;

  function setMessage(id, message, error = false) {
    const element = $(id);

    if (!element) return;

    element.textContent = message || '';
    element.classList.toggle('error-message', error);
  }

  function setStatus(enabled, method) {
    const dot = $('statusDot');
    const title = $('statusTitle');
    const description = $('statusDescription');

    if (enabled) {
      dot.classList.add('enabled');

      title.textContent = 'MFA enabled';

      description.textContent =
        method === 'totp'
          ? 'Your account is protected by an authenticator app.'
          : 'Multi-factor authentication is enabled.';

      $('setupPanel').hidden = true;
      $('verificationPanel').hidden = true;

      if ($('authenticatorPanel')) {
        $('authenticatorPanel').hidden = false;
      }

      if ($('recoveryManagementPanel')) {
        $('recoveryManagementPanel').hidden = false;
      }
    } else {
      dot.classList.remove('enabled');

      title.textContent = 'MFA not enabled';

      description.textContent =
        'Enable an authenticator app to add a second factor.';

      $('setupPanel').hidden = false;

      if ($('authenticatorPanel')) {
        $('authenticatorPanel').hidden = true;
      }

      if ($('recoveryManagementPanel')) {
        $('recoveryManagementPanel').hidden = true;
      }
    }
  }

  async function loadStatus() {
    try {
      const response = await api('/api/mfa/status');

      if (!response) return;

      if (!response.ok) {
        setMessage(
          'setupMessage',
          'Unable to load MFA status.',
          true,
        );

        return;
      }

      const status = await response.json();

      setStatus(
        Boolean(status.enabled),
        status.method,
      );
    } catch (error) {
      setMessage(
        'setupMessage',
        error.message || 'Unable to load MFA status.',
        true,
      );
    }
  }

  async function startEnrollment() {
    $('startButton').disabled = true;

    setMessage(
      'setupMessage',
      'Preparing MFA setup…',
    );

    try {
      const response = await api('/api/mfa/enroll', {
        method: 'POST',
      });

      if (!response) return;

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          body.message ||
            'Unable to start MFA enrollment.',
        );
      }

      const data = await response.json();

      $('qrCode').src = data.qrCode;

      $('secret').textContent =
        data.secret || '—';

      $('otpauthUri').value =
        data.otpauthUri || '';

      $('verificationPanel').hidden = false;

      $('totpCode').focus();

      setMessage(
        'setupMessage',
        '',
      );

      setMessage(
        'verifyMessage',
        '',
      );

      setMessage(
        'recoveryMessage',
        '',
      );
    } catch (error) {
      setMessage(
        'setupMessage',
        error.message ||
          'Unable to start MFA enrollment.',
        true,
      );
    } finally {
      $('startButton').disabled = false;
    }
  }

  async function verifyEnrollment(event) {
    event.preventDefault();

    const code =
      $('totpCode')
        .value
        .trim();

    if (!/^\d{6}$/.test(code)) {
      setMessage(
        'verifyMessage',
        'Enter the 6-digit code from your authenticator app.',
        true,
      );

      $('totpCode').focus();

      return;
    }

    $('verifyButton').disabled = true;

    setMessage(
      'verifyMessage',
      'Verifying code…',
    );

    try {
      const response = await api(
        '/api/mfa/enroll/verify',
        {
          method: 'POST',

          body: JSON.stringify({
            code,
          }),
        },
      );

      if (!response) return;

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          body.message ||
            'Invalid MFA verification code.',
        );
      }

      const data =
        await response.json();

      recoveryCodes =
        Array.isArray(
          data.recoveryCodes,
        )
          ? data.recoveryCodes
          : [];

      renderRecoveryCodes();

      $('verificationPanel').hidden = true;

      $('recoveryPanel').hidden = false;

      $('setupPanel').hidden = true;

      setStatus(
        true,
        data.method,
      );

      $('totpCode').value = '';
    } catch (error) {
      setMessage(
        'verifyMessage',
        error.message ||
          'Unable to verify MFA code.',
        true,
      );
    } finally {
      $('verifyButton').disabled = false;
    }
  }

  function renderRecoveryCodes() {
    const container =
      $('recoveryCodes');

    if (!container) return;

    container.replaceChildren(
      ...recoveryCodes.map(
        (code) => {
          const item =
            document.createElement(
              'code',
            );

          item.textContent = code;

          return item;
        },
      ),
    );
  }

  async function copyText(text) {
    if (!navigator.clipboard) {
      throw new Error(
        'Clipboard access is unavailable.',
      );
    }

    await navigator.clipboard.writeText(
      text,
    );
  }

  async function copySecret() {
    try {
      await copyText(
        $('secret').textContent,
      );

      setMessage(
        'verifyMessage',
        'Manual setup key copied.',
      );
    } catch {
      setMessage(
        'verifyMessage',
        'Unable to copy the setup key.',
        true,
      );
    }
  }

  async function copyRecovery() {
    if (!recoveryCodes.length) {
      setMessage(
        'recoveryMessage',
        'No recovery codes are currently available to copy.',
        true,
      );

      return;
    }

    try {
      await copyText(
        recoveryCodes.join('\n'),
      );

      setMessage(
        'recoveryMessage',
        'Recovery codes copied. Store them somewhere secure.',
      );
    } catch {
      setMessage(
        'recoveryMessage',
        'Unable to copy the recovery codes.',
        true,
      );
    }
  }

  function openConfirmModal(action) {
    confirmAction = action;

    const isDisable =
      action === 'disable';

    $('confirmEyebrow').textContent =
      isDisable
        ? 'MFA protection'
        : 'Recovery codes';

    $('confirmIcon').textContent =
      isDisable ? '!' : '↻';

    $('confirmTitle').textContent =
      isDisable
        ? 'Disable Multi-Factor Authentication?'
        : 'Regenerate recovery codes?';

    $('confirmDescription').textContent =
      isDisable
        ? 'This will remove MFA protection from your client administrator account. Enter your current authenticator code to continue.'
        : 'Your existing recovery codes will immediately become invalid. Enter your current authenticator code to generate a new set.';

    $('confirmProceed').textContent =
      isDisable
        ? 'Disable MFA'
        : 'Regenerate';

    $('confirmCodeMessage').textContent =
      '';

    $('confirmTotpCode').value =
      '';

    /*
     * Both operations require the current
     * authenticator/TOTP code.
     */
    $('confirmCodeField').hidden =
      false;

    $('confirmModal').hidden =
      false;

    setTimeout(
      () =>
        $('confirmTotpCode').focus(),
      0,
    );
  }

  function closeConfirmModal() {
    $('confirmModal').hidden = true;

    $('confirmCodeMessage').textContent =
      '';

    $('confirmTotpCode').value =
      '';

    confirmAction = null;
  }

  async function disableMfa() {
    const code =
      $('confirmTotpCode')
        .value
        .trim();

    if (!/^\d{6}$/.test(code)) {
      $('confirmCodeMessage').textContent =
        'Enter the 6-digit code from your authenticator app.';

      $('confirmTotpCode').focus();

      return;
    }

    const button =
      $('confirmProceed');

    button.disabled = true;

    button.textContent =
      'Disabling…';

    try {
      const response = await api(
        '/api/mfa/disable',
        {
          method: 'POST',

          body: JSON.stringify({
            code,
          }),
        },
      );

      if (!response) return;

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          body.message ||
            'Unable to disable MFA.',
        );
      }

      closeConfirmModal();

      recoveryCodes = [];

      $('recoveryCodes')
        ?.replaceChildren();

      $('recoveryPanel').hidden =
        true;

      $('verificationPanel').hidden =
        true;

      setMessage(
        'disableMessage',
        'MFA has been disabled.',
      );

      setMessage(
        'setupMessage',
        'MFA is disabled. Enable it again whenever you are ready.',
      );

      setStatus(false);
    } catch (error) {
      $('confirmCodeMessage').textContent =
        error.message ||
        'Unable to disable MFA.';
    } finally {
      button.disabled = false;

      button.textContent =
        'Disable MFA';
    }
  }

  async function regenerateRecoveryCodes() {
    const code =
      $('confirmTotpCode')
        .value
        .trim();

    if (!/^\d{6}$/.test(code)) {
      $('confirmCodeMessage').textContent =
        'Enter the 6-digit code from your authenticator app.';

      $('confirmTotpCode').focus();

      return;
    }

    const button =
      $('confirmProceed');

    button.disabled = true;

    button.textContent =
      'Regenerating…';

    try {
      const response = await api(
        '/api/mfa/recovery-codes/regenerate',
        {
          method: 'POST',

          /*
           * The API requires the current
           * 6-digit authenticator code.
           */
          body: JSON.stringify({
            code,
          }),
        },
      );

      if (!response) return;

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({}));

        throw new Error(
          body.message ||
            'Unable to regenerate recovery codes.',
        );
      }

      const data =
        await response.json();

      recoveryCodes =
        Array.isArray(
          data.recoveryCodes,
        )
          ? data.recoveryCodes
          : [];

      renderRecoveryCodes();

      $('recoveryPanel').hidden =
        false;

      $('setupPanel').hidden =
        true;

      $('verificationPanel').hidden =
        true;

      closeConfirmModal();

      setMessage(
        'recoveryMessage',
        'New recovery codes generated. Your previous codes are no longer valid.',
      );

      setStatus(
        true,
        data.method || 'totp',
      );

      $('recoveryPanel')
        .scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
    } catch (error) {
      $('confirmCodeMessage').textContent =
        error.message ||
        'Unable to regenerate recovery codes.';
    } finally {
      button.disabled = false;

      button.textContent =
        'Regenerate';
    }
  }

  async function confirmActionHandler() {
    if (
      confirmAction ===
      'disable'
    ) {
      await disableMfa();

      return;
    }

    if (
      confirmAction ===
      'regenerate'
    ) {
      await regenerateRecoveryCodes();
    }
  }

  function init() {
    $('startButton')?.addEventListener(
      'click',
      startEnrollment,
    );

    $('verifyForm')?.addEventListener(
      'submit',
      verifyEnrollment,
    );

    $('copySecret')?.addEventListener(
      'click',
      copySecret,
    );

    $('copyRecovery')?.addEventListener(
      'click',
      copyRecovery,
    );

    $('disableButton')?.addEventListener(
      'click',
      () =>
        openConfirmModal(
          'disable',
        ),
    );

    $('regenerateButton')?.addEventListener(
      'click',
      () =>
        openConfirmModal(
          'regenerate',
        ),
    );

    $('confirmCancel')?.addEventListener(
      'click',
      closeConfirmModal,
    );

    $('confirmProceed')?.addEventListener(
      'click',
      confirmActionHandler,
    );

    $('confirmModal')?.addEventListener(
      'click',
      (event) => {
        if (
          event.target ===
          $('confirmModal')
        ) {
          closeConfirmModal();
        }
      },
    );

    $('confirmTotpCode')?.addEventListener(
      'input',
      () => {
        $('confirmCodeMessage').textContent =
          '';
      },
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key ===
            'Escape' &&
          $('confirmModal') &&
          !$('confirmModal').hidden
        ) {
          closeConfirmModal();
        }
      },
    );

    loadStatus();
  }

  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
    );
  } else {
    init();
  }
})();