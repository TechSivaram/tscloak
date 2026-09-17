(() => {
  function init() {
    const form = document.getElementById('policyForm');
    Admin.apiFetch('/api/admin/security-policy').then(async response => {
      if (response && response.ok) { const policy = await response.json(); Object.keys(policy).forEach(key => { if (form.elements[key]) form.elements[key].value = policy[key]; }); }
    });
    form.addEventListener('submit', async event => { event.preventDefault(); const payload = {}; new FormData(form).forEach((value, key) => { if (value !== '') payload[key] = Number(value); }); const save = await Admin.apiFetch('/api/admin/security-policy', { method: 'PUT', body: JSON.stringify(payload) }); if (save && save.ok) Admin.showMessage('Security policy saved.'); else if (save) Admin.showMessage(`Unable to save policy (${save.status})`, true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
