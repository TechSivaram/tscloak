(() => {
  function initialsFor(displayName) {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return parts
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
    }
    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }

  function showAvatarFallback(image, fallback, displayName) {
    image.hidden = true;
    image.removeAttribute('src');
    image.onerror = null;
    fallback.textContent = initialsFor(displayName);
    fallback.setAttribute('aria-label', `${displayName} initials`);
    fallback.hidden = false;
  }

  function setAvatar(image, fallback, avatarUrl, displayName) {
    fallback.hidden = true;
    fallback.textContent = '';
    image.hidden = true;
    image.removeAttribute('src');

    if (!avatarUrl) {
      showAvatarFallback(image, fallback, displayName);
      return;
    }

    try {
      const url = new URL(avatarUrl);
      if (url.protocol !== 'https:') {
        showAvatarFallback(image, fallback, displayName);
        return;
      }
      image.alt = `${displayName} profile picture`;
      image.onerror = () => showAvatarFallback(image, fallback, displayName);
      image.src = url.toString();
      image.hidden = false;
    } catch {
      showAvatarFallback(image, fallback, displayName);
    }
  }

  async function loadProfile() {
    const response = await ClientAdmin.api('/api/account/profile');
    if (!response || !response.ok) {
      const message = document.querySelector('[data-message]');
      if (message) message.textContent = 'Unable to load profile.';
      return;
    }

    const profile = await response.json();
    const displayName =
      profile.displayName || profile.username || 'Administrator';
    document.getElementById('displayName').textContent = displayName;
    document.getElementById('username').textContent = profile.username || '—';
    document.getElementById('email').textContent = profile.email || '—';
    document.getElementById('roles').textContent =
      Array.isArray(profile.roles) && profile.roles.length
        ? profile.roles.join(', ')
        : '—';
    document.getElementById('client').textContent = profile.client?.name || '—';
    document
      .querySelectorAll('[data-user-name], .user-chip strong')
      .forEach((element) => (element.textContent = displayName));

    const federation = document.getElementById('federation');
    if (profile.federation?.providerName) {
      federation.textContent = `Signed in with ${profile.federation.providerName}`;
      federation.hidden = false;
    } else {
      federation.hidden = true;
    }

    setAvatar(
      document.getElementById('avatar'),
      document.getElementById('avatarFallback'),
      profile.avatarUrl,
      displayName,
    );
  }

  loadProfile();
})();
