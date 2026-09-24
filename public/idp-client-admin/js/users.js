(async () => {
  const formPanel = document.getElementById('userFormPanel');
  const rows = document.getElementById('userRows');

  await ClientAdmin.loadMe();

  /**
   * Escape untrusted values before inserting them into HTML.
   * Do not rely on backend validation as an XSS defense.
   */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Encode an identifier before using it as a URL path segment.
   */
  function encodePathSegment(value) {
    return encodeURIComponent(String(value ?? ''));
  }

  const load = async () => {
    const response = await ClientAdmin.api('/api/users');

    if (!response || !response.ok) {
      rows.innerHTML = '<tr><td colspan="6">Unable to load users.</td></tr>';
      return;
    }

    const users = await response.json();

    rows.innerHTML = users.length
      ? users
          .map(
            (user) => `
              <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.roles?.join(', ') || '—')}</td>
                <td>${user.enabled ? 'Enabled' : 'Disabled'}</td>
                <td>${escapeHtml(
                  new Date(user.createdAt).toLocaleDateString(),
                )}</td>
                <td>
                  <button
                    class="refresh"
                    data-edit="${escapeHtml(user.id)}"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            `,
          )
          .join('')
      : '<tr><td colspan="6">No users found.</td></tr>';

    rows.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const user = users.find(
          (item) => String(item.id) === String(button.dataset.edit),
        );

        if (user) {
          openEdit(user);
        }
      });
    });
  };

  function openEdit(user) {
    formPanel.hidden = false;

    formPanel.querySelector('h3').textContent = `Edit ${user.username}`;

    formPanel.querySelector('form').innerHTML = `
      <label>
        Username
        <input
          value="${escapeHtml(user.username)}"
          disabled
        >
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          required
          value="${escapeHtml(user.email)}"
        >
      </label>

      <label>
        Status
        <select name="enabled">
          <option
            value="true"
            ${user.enabled ? 'selected' : ''}
          >
            Enabled
          </option>
          <option
            value="false"
            ${!user.enabled ? 'selected' : ''}
          >
            Disabled
          </option>
        </select>
      </label>

      <div class="actions">
        <button
          type="button"
          class="secondary"
          id="cancelEdit"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="primary"
        >
          Save changes
        </button>
      </div>
    `;

    formPanel.querySelector('#cancelEdit').onclick = () => {
      formPanel.hidden = true;
    };

    formPanel.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();

      const values = Object.fromEntries(new FormData(event.target));

      const response = await ClientAdmin.api(
        `/api/users/${encodePathSegment(user.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            email: values.email,
            enabled: values.enabled === 'true',
          }),
        },
      );

      if (response && response.ok) {
        formPanel.hidden = true;
        await load();
      }
    };
  }

  document.getElementById('showUserForm').onclick = () => {
    formPanel.hidden = false;

    formPanel.querySelector('h3').textContent = 'Create user';

    formPanel.querySelector('form').innerHTML = `
      <label>
        Username
        <input
          name="username"
          required
          minlength="3"
        >
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          required
        >
      </label>

      <label>
        Password
        <input
          name="password"
          type="password"
          required
          minlength="8"
        >
      </label>

      <div class="actions">
        <button
          type="button"
          class="secondary"
          id="cancelCreate"
        >
          Cancel
        </button>

        <button
          type="submit"
          class="primary"
        >
          Create user
        </button>
      </div>
    `;

    formPanel.querySelector('#cancelCreate').onclick = () => {
      formPanel.hidden = true;
    };

    formPanel.querySelector('form').onsubmit = async (event) => {
      event.preventDefault();

      const payload = Object.fromEntries(new FormData(event.target));

      const response = await ClientAdmin.api('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response && response.ok) {
        formPanel.hidden = true;
        await load();
      }
    };
  };

  document.getElementById('refreshUsers').onclick = load;

  await load();
})();
