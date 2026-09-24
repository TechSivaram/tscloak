(() => {
  const rows = document.getElementById('userRows');
  const roleOptions = [];
  let selectedClientId = '';

  /**
   * Escape untrusted values before inserting them into HTML.
   *
   * Usernames, emails, role names, client names, IDs, etc. can be
   * attacker-controlled. Never interpolate these values directly
   * into innerHTML.
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function rolePicker(user) {
    const selected = user.roles || [];
    const userId = escapeHtml(user.id);

    const summary = selected.length
      ? `${selected.length} role${selected.length === 1 ? '' : 's'} selected`
      : 'No roles assigned';

    const options = roleOptions
      .map((role) => {
        const roleName = escapeHtml(role.name);

        return `
          <label class="role-option">
            <input
              type="checkbox"
              value="${roleName}"
              ${selected.includes(role.name) ? 'checked' : ''}
            >
            <span>${roleName}</span>
          </label>
        `;
      })
      .join('');

    return `
      <div class="role-picker" data-picker="${userId}">
        <button
          class="role-picker-button"
          type="button"
          data-open-picker="${userId}"
        >
          ${summary}<span>⌄</span>
        </button>

        <div
          class="role-picker-menu"
          data-picker-menu="${userId}"
          hidden
        >
          <input
            class="role-search"
            type="search"
            placeholder="Search roles"
            aria-label="Search roles"
          >

          <div class="role-options">
            ${
              options ||
              '<span class="role-empty">No roles configured</span>'
            }
          </div>

          <div class="role-picker-footer">
            <button
              class="text-button"
              type="button"
              data-clear-roles="${userId}"
            >
              Clear
            </button>

            <button
              class="button primary compact-button"
              type="button"
              data-save-roles="${userId}"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async function loadUsers() {
    const query = selectedClientId
      ? `?client_id=${encodeURIComponent(selectedClientId)}`
      : '';

    const [usersResponse, rolesResponse] = await Promise.all([
      Admin.apiFetch(`/api/users${query}`),
      Admin.apiFetch('/api/users/roles'),
    ]);

    if (
      !usersResponse ||
      !usersResponse.ok ||
      !rolesResponse ||
      !rolesResponse.ok
    ) {
      rows.innerHTML =
        '<tr><td colspan="6">Unable to load users or roles.</td></tr>';
      return;
    }

    const users = await usersResponse.json();

    roleOptions.splice(
      0,
      roleOptions.length,
      ...(await rolesResponse.json()),
    );

    document.getElementById('userCount').textContent =
      `${users.length} user${users.length === 1 ? '' : 's'}`;

    rows.innerHTML = users.length
      ? users
          .map((user) => {
            const userId = escapeHtml(user.id);
            const username = escapeHtml(user.username);
            const email = escapeHtml(user.email);
            const createdAt = escapeHtml(
              new Date(user.createdAt).toLocaleDateString(),
            );

            return `
              <tr>
                <td>${username}</td>
                <td>${email}</td>
                <td>${rolePicker(user)}</td>
                <td>
                  <span class="status-pill ${
                    user.enabled ? 'enabled' : 'disabled'
                  }">
                    ${user.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td>${createdAt}</td>
                <td>
                  <button
                    class="text-button"
                    data-edit-user="${userId}"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            `;
          })
          .join('')
      : '<tr><td colspan="6">No users found.</td></tr>';

    bindRolePickers();

    rows.querySelectorAll('[data-edit-user]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = users.find(
          (item) => String(item.id) === String(button.dataset.editUser),
        );

        if (user) {
          openUserEditor(user);
        }
      });
    });
  }

  function openUserEditor(user) {
    const existing = document.getElementById('userEditPanel');

    if (existing) {
      existing.remove();
    }

    const panel = document.createElement('section');

    panel.className = 'panel user-edit-panel';
    panel.id = 'userEditPanel';

    const username = escapeHtml(user.username);
    const email = escapeHtml(user.email);

    panel.innerHTML = `
      <div class="panel-header">
        <div>
          <p class="eyebrow">Identity</p>
          <h3>Edit ${username}</h3>
        </div>
      </div>

      <form class="admin-form">
        <label>
          Username
          <input
            value="${username}"
            disabled
          >
        </label>

        <label>
          Email
          <input
            name="email"
            type="email"
            required
            value="${email}"
          >
        </label>

        <label>
          Status
          <select name="enabled">
            <option value="true" ${user.enabled ? 'selected' : ''}>
              Enabled
            </option>
            <option value="false" ${!user.enabled ? 'selected' : ''}>
              Disabled
            </option>
          </select>
        </label>

        <div class="form-actions">
          <button
            class="button secondary"
            type="button"
            data-close-editor
          >
            Cancel
          </button>

          <button
            class="button primary"
            type="submit"
          >
            Save changes
          </button>
        </div>
      </form>
    `;

    document.querySelector('main.content').appendChild(panel);

    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    panel
      .querySelector('[data-close-editor]')
      .addEventListener('click', () => panel.remove());

    panel.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.target));

      const query = selectedClientId
        ? `?client_id=${encodeURIComponent(selectedClientId)}`
        : '';

      const response = await Admin.apiFetch(
        `/api/users/${encodeURIComponent(user.id)}${query}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            email: values.email,
            enabled: values.enabled === 'true',
          }),
        },
      );

      if (response && response.ok) {
        Admin.showMessage('User updated.');
        panel.remove();
        loadUsers();
      } else {
        Admin.showMessage('Unable to update user.', true);
      }
    });
  }

  function bindRolePickers() {
    rows.querySelectorAll('[data-open-picker]').forEach((button) => {
      button.addEventListener('click', () => {
        const pickerId = button.dataset.openPicker;

        const menu = Array.from(
          rows.querySelectorAll('[data-picker-menu]'),
        ).find(
          (item) => item.dataset.pickerMenu === pickerId,
        );

        if (!menu) {
          return;
        }

        rows
          .querySelectorAll('.role-picker-menu')
          .forEach((item) => {
            if (item !== menu) {
              item.hidden = true;
            }
          });

        menu.hidden = !menu.hidden;
      });
    });

    rows.querySelectorAll('.role-search').forEach((input) => {
      input.addEventListener('input', () => {
        const query = input.value.toLowerCase();

        input
          .closest('.role-picker-menu')
          .querySelectorAll('.role-option')
          .forEach((option) => {
            option.hidden = !option.textContent
              .toLowerCase()
              .includes(query);
          });
      });
    });

    rows.querySelectorAll('[data-clear-roles]').forEach((button) => {
      button.addEventListener('click', () => {
        button
          .closest('.role-picker-menu')
          .querySelectorAll('input[type="checkbox"]')
          .forEach((input) => {
            input.checked = false;
          });
      });
    });

    rows.querySelectorAll('[data-save-roles]').forEach((button) => {
      button.addEventListener('click', async () => {
        const menu = button.closest('.role-picker-menu');

        const roles = Array.from(
          menu.querySelectorAll(
            'input[type="checkbox"]:checked',
          ),
        ).map((input) => input.value);

        button.disabled = true;

        const query = selectedClientId
          ? `?client_id=${encodeURIComponent(selectedClientId)}`
          : '';

        const response = await Admin.apiFetch(
          `/api/users/${encodeURIComponent(button.dataset.saveRoles)}/roles${query}`,
          {
            method: 'PUT',
            body: JSON.stringify({ roles }),
          },
        );

        button.disabled = false;

        if (response && response.ok) {
          Admin.showMessage('User roles updated.');
          menu.hidden = true;
          loadUsers();
        } else {
          Admin.showMessage('Unable to update user roles.', true);
        }
      });
    });
  }

  async function setupClientScope() {
    const response = await Admin.apiFetch('/api/admin/clients');

    if (!response || !response.ok) {
      return;
    }

    const clients = await response.json();

    if (!clients.length) {
      return;
    }

    selectedClientId = clients[0].clientId;

    const intro = document.querySelector('.management-intro');
    const scope = document.createElement('label');

    scope.className = 'client-scope-control';

    const options = clients
      .map((client) => {
        const clientId = escapeHtml(client.clientId);
        const clientName = escapeHtml(client.name);

        return `
          <option value="${clientId}">
            ${clientName}
          </option>
        `;
      })
      .join('');

    scope.innerHTML = `
      <span>Managing client</span>
      <select id="clientScope">
        ${options}
      </select>
    `;

    intro.appendChild(scope);

    scope
      .querySelector('select')
      .addEventListener('change', (event) => {
        selectedClientId = event.target.value;
        loadUsers();
      });
  }

  function init() {
    setupClientScope().then(loadUsers);

    document.addEventListener(
      'admin:refresh',
      loadUsers,
    );

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.role-picker')) {
        rows
          .querySelectorAll('.role-picker-menu')
          .forEach((menu) => {
            menu.hidden = true;
          });
      }
    });

    document
      .getElementById('showUserForm')
      .addEventListener('click', () => {
        const panel = document.getElementById(
          'userFormPanel',
        );

        panel.hidden = !panel.hidden;

        if (!panel.hidden) {
          panel.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }
      });

    document
      .getElementById('userForm')
      .addEventListener('submit', async (event) => {
        event.preventDefault();

        const payload = Object.fromEntries(
          new FormData(event.target),
        );

        if (selectedClientId) {
          payload.clientId = selectedClientId;
        }

        const response = await Admin.apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (response && response.ok) {
          event.target.reset();
          document.getElementById(
            'userFormPanel',
          ).hidden = true;

          loadUsers();
        } else {
          Admin.showMessage(
            'Unable to create user.',
            true,
          );
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      init,
    );
  } else {
    init();
  }
})();