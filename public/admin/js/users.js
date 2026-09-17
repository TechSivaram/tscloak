(() => {
  const rows = document.getElementById('userRows');
  const roleOptions = [];

  function rolePicker(user) {
    const selected = user.roles || [];
    const summary = selected.length ? `${selected.length} role${selected.length === 1 ? '' : 's'} selected` : 'No roles assigned';
    const options = roleOptions.map(role => `<label class="role-option"><input type="checkbox" value="${role.name}" ${selected.includes(role.name) ? 'checked' : ''}><span>${role.name}</span></label>`).join('');
    return `<div class="role-picker" data-picker="${user.id}"><button class="role-picker-button" type="button" data-open-picker="${user.id}">${summary}<span>⌄</span></button><div class="role-picker-menu" data-picker-menu="${user.id}" hidden><input class="role-search" type="search" placeholder="Search roles" aria-label="Search roles"><div class="role-options">${options || '<span class="role-empty">No roles configured</span>'}</div><div class="role-picker-footer"><button class="text-button" type="button" data-clear-roles="${user.id}">Clear</button><button class="button primary compact-button" type="button" data-save-roles="${user.id}">Apply</button></div></div></div>`;
  }

  async function loadUsers() {
    const [usersResponse, rolesResponse] = await Promise.all([Admin.apiFetch('/api/users'), Admin.apiFetch('/api/users/roles')]);
    if (!usersResponse || !usersResponse.ok || !rolesResponse || !rolesResponse.ok) { rows.innerHTML = '<tr><td colspan="6">Unable to load users or roles.</td></tr>'; return; }
    const users = await usersResponse.json();
    roleOptions.splice(0, roleOptions.length, ...(await rolesResponse.json()));
    document.getElementById('userCount').textContent = `${users.length} user${users.length === 1 ? '' : 's'}`;
    rows.innerHTML = users.length ? users.map(user => `<tr><td>${user.username}</td><td>${user.email}</td><td>${rolePicker(user)}</td><td><span class="status-pill ${user.enabled ? 'enabled' : 'disabled'}">${user.enabled ? 'Enabled' : 'Disabled'}</span></td><td>${new Date(user.createdAt).toLocaleDateString()}</td><td><button class="text-button" data-edit-user="${user.id}">Edit</button></td></tr>`).join('') : '<tr><td colspan="6">No users found.</td></tr>';
    bindRolePickers();
    rows.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => openUserEditor(users.find(user => user.id === button.dataset.editUser))));
  }

  function openUserEditor(user) {
    const existing = document.getElementById('userEditPanel');
    if (existing) existing.remove();
    const panel = document.createElement('section');
    panel.className = 'panel user-edit-panel';
    panel.id = 'userEditPanel';
    panel.innerHTML = `<div class="panel-header"><div><p class="eyebrow">Identity</p><h3>Edit ${user.username}</h3></div></div><form class="admin-form"><label>Username<input value="${user.username}" disabled></label><label>Email<input name="email" type="email" required value="${user.email}"></label><label>Status<select name="enabled"><option value="true" ${user.enabled ? 'selected' : ''}>Enabled</option><option value="false" ${!user.enabled ? 'selected' : ''}>Disabled</option></select></label><div class="form-actions"><button class="button secondary" type="button" data-close-editor>Cancel</button><button class="button primary" type="submit">Save changes</button></div></form>`;
    document.querySelector('main.content').appendChild(panel);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    panel.querySelector('[data-close-editor]').addEventListener('click', () => panel.remove());
    panel.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.target));
      const response = await Admin.apiFetch(`/api/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ email: values.email, enabled: values.enabled === 'true' }) });
      if (response && response.ok) { Admin.showMessage('User updated.'); panel.remove(); loadUsers(); } else Admin.showMessage('Unable to update user.', true);
    });
  }

  function bindRolePickers() {
    rows.querySelectorAll('[data-open-picker]').forEach(button => button.addEventListener('click', () => {
      const menu = rows.querySelector(`[data-picker-menu="${button.dataset.openPicker}"]`);
      rows.querySelectorAll('.role-picker-menu').forEach(item => { if (item !== menu) item.hidden = true; });
      menu.hidden = !menu.hidden;
    }));
    rows.querySelectorAll('.role-search').forEach(input => input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      input.closest('.role-picker-menu').querySelectorAll('.role-option').forEach(option => { option.hidden = !option.textContent.toLowerCase().includes(query); });
    }));
    rows.querySelectorAll('[data-clear-roles]').forEach(button => button.addEventListener('click', () => button.closest('.role-picker-menu').querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; })));
    rows.querySelectorAll('[data-save-roles]').forEach(button => button.addEventListener('click', async () => {
      const menu = button.closest('.role-picker-menu');
      const roles = Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value);
      button.disabled = true;
      const response = await Admin.apiFetch(`/api/users/${button.dataset.saveRoles}/roles`, { method: 'PUT', body: JSON.stringify({ roles }) });
      button.disabled = false;
      if (response && response.ok) { Admin.showMessage('User roles updated.'); menu.hidden = true; loadUsers(); } else Admin.showMessage('Unable to update user roles.', true);
    }));
  }

  function init() {
    loadUsers();
    document.addEventListener('click', event => { if (!event.target.closest('.role-picker')) rows.querySelectorAll('.role-picker-menu').forEach(menu => { menu.hidden = true; }); });
    document.getElementById('showUserForm').addEventListener('click', () => { const panel = document.getElementById('userFormPanel'); panel.hidden = !panel.hidden; if (!panel.hidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    document.getElementById('userForm').addEventListener('submit', async event => { event.preventDefault(); const response = await Admin.apiFetch('/api/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); if (response && response.ok) { event.target.reset(); document.getElementById('userFormPanel').hidden = true; loadUsers(); } else Admin.showMessage('Unable to create user.', true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
