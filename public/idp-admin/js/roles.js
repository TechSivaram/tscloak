(() => {
  const rows = document.getElementById('roleRows');

  async function loadRoles() {
    const response = await Admin.apiFetch('/api/users/roles');
    if (!response || !response.ok) { rows.innerHTML = '<tr><td colspan="3">Unable to load roles.</td></tr>'; return; }
    const roles = await response.json();
    rows.innerHTML = roles.length ? roles.map(role => `<tr><td>${role.name}</td><td>${role.description || '—'}</td><td><code>${role.id}</code></td><td><button class="text-button" data-edit-role="${role.id}">Edit</button></td></tr>`).join('') : '<tr><td colspan="4">No roles found.</td></tr>';
    rows.querySelectorAll('[data-edit-role]').forEach(button => button.addEventListener('click', () => openRoleEditor(roles.find(role => role.id === button.dataset.editRole))));
  }

  function openRoleEditor(role) {
    const existing = document.getElementById('roleEditPanel');
    if (existing) existing.remove();
    const panel = document.createElement('section');
    panel.className = 'panel role-edit-panel';
    panel.id = 'roleEditPanel';
    panel.innerHTML = `<div class="panel-header"><div><p class="eyebrow">Authorization</p><h3>Edit ${role.name}</h3></div></div><form class="admin-form"><label>Role name<input value="${role.name}" disabled></label><label>Description<input name="description" value="${role.description || ''}"></label><div class="form-actions"><button class="button secondary" type="button" data-close-editor>Cancel</button><button class="button primary" type="submit">Save changes</button></div></form>`;
    document.querySelector('main.content').appendChild(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.querySelector('[data-close-editor]').addEventListener('click', () => panel.remove());
    panel.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const response = await Admin.apiFetch(`/api/users/roles/${role.id}`, { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
      if (response && response.ok) { Admin.showMessage('Role updated.'); panel.remove(); loadRoles(); } else Admin.showMessage('Unable to update role.', true);
    });
  }

  function init() {
    document.querySelector('#roleRows').closest('table').querySelector('thead tr').insertAdjacentHTML('beforeend', '<th>Actions</th>');
    loadRoles();
    document.addEventListener('admin:refresh', loadRoles);
    document.getElementById('showRoleForm').addEventListener('click', () => { const panel = document.getElementById('roleFormPanel'); panel.hidden = !panel.hidden; });
    document.getElementById('roleForm').addEventListener('submit', async event => { event.preventDefault(); const response = await Admin.apiFetch('/api/users/roles', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); if (response && response.ok) { event.target.reset(); document.getElementById('roleFormPanel').hidden = true; loadRoles(); } else Admin.showMessage('Unable to create role.', true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
