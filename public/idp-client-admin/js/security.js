(() => {
  const isClientAdmin = window.location.pathname.includes('/idp-client-admin/');
  const api = (url, options) =>
    isClientAdmin ? window.ClientAdmin.api(url, options) : window.Admin.apiFetch(url, options);

  const $ = (id) => document.getElementById(id);

  let recoveryCodes = [];

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
      description.textContent = method === 'totp'
        ? 'Your account is protected by an authenticator app.'
        : 'Multi-factor authentication is enabled.';
      $('setupPanel').hidden = true;
    } else {
      dot.classList.remove('enabled');
      title.textContent = 'MFA not enabled';
      description.textContent = 'Enable an authenticator app to add a second factor.';
      $('setupPanel').hidden = false;
    }
  }

  async function loadStatus() {
    const response = await api('/api/mfa/status');
    if (!response) return;
    if (!response.ok) {
      setMessage('setupMessage', 'Unable to load MFA status.', true);
      return;
    }
    const status = await response.json();
    setStatus(Boolean(status.enabled), status.method);
  }

  async function startEnrollment() {
    $('startButton').disabled = true;
    setMessage('setupMessage', 'Preparing MFA setup…');

    try {
      const response = await api('/api/mfa/enroll', { method: 'POST' });
      if (!response) return;

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Unable to start MFA enrollment.');
      }

      const data = await response.json();
      $('qrCode').src = data.qrCode;
      $('secret').textContent = data.secret || '—';
      $('otpauthUri').value = data.otpauthUri || '';
      $('verificationPanel').hidden = false;
      $('totpCode').focus();
      setMessage('setupMessage', '');
      setMessage('verifyMessage', '');
    } catch (error) {
      setMessage('setupMessage', error.message || 'Unable to start MFA enrollment.', true);
    } finally {
      $('startButton').disabled = false;
    }
  }

  async function verifyEnrollment(event) {
    event.preventDefault();
    const code = $('totpCode').value.trim();
    if (!/^\d{6}$/.test(code)) {
      setMessage('verifyMessage', 'Enter the 6-digit code from your authenticator app.', true);
      $('totpCode').focus();
      return;
    }

    $('verifyButton').disabled = true;
    setMessage('verifyMessage', 'Verifying code…');

    try {
      const response = await api('/api/mfa/enroll/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      if (!response) return;

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || 'Invalid MFA verification code.');
      }

      const data = await response.json();
      recoveryCodes = Array.isArray(data.recoveryCodes) ? data.recoveryCodes : [];
      renderRecoveryCodes();
      $('verificationPanel').hidden = true;
      $('recoveryPanel').hidden = false;
      $('setupPanel').hidden = true;
      setStatus(true, data.method);
      $('totpCode').value = '';
    } catch (error) {
      setMessage('verifyMessage', error.message || 'Unable to verify MFA code.', true);
    } finally {
      $('verifyButton').disabled = false;
    }
  }

  function renderRecoveryCodes() {
    const container = $('recoveryCodes');
    container.replaceChildren(...recoveryCodes.map((code) => {
      const item = document.createElement('code');
      item.textContent = code;
      return item;
    }));
  }

  async function copyText(text) {
    if (!navigator.clipboard) throw new Error('Clipboard access is unavailable.');
    await navigator.clipboard.writeText(text);
  }

  async function copySecret() {
    try {
      await copyText($('secret').textContent);
      setMessage('verifyMessage', 'Manual setup key copied.');
    } catch {
      setMessage('verifyMessage', 'Unable to copy the setup key.', true);
    }
  }

  async function copyRecovery() {
    try {
      await copyText(recoveryCodes.join('\n'));
      setMessage('recoveryMessage', 'Recovery codes copied. Store them somewhere secure.');
    } catch {
      setMessage('recoveryMessage', 'Unable to copy the recovery codes.', true);
    }
  }

  function init() {
    $('startButton')?.addEventListener('click', startEnrollment);
    $('verifyForm')?.addEventListener('submit', verifyEnrollment);
    $('copySecret')?.addEventListener('click', copySecret);
    $('copyRecovery')?.addEventListener('click', copyRecovery);
    loadStatus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
