(() => {
  const pages = {
    'clients.html': ['clients.css', 'clients.js'],
    'users.html': ['users.css', 'users.js'],
    'roles.html': ['roles.css', 'roles.js'],
    'initial-access-tokens.html': ['initial-access-tokens.css', 'initial-access-tokens.js'],
    'security-policy.html': ['security-policy.css', 'security-policy.js'],
    'profile.html': ['profile.css', 'profile.js'],
  };

  const page = pages[window.location.pathname.split('/').pop()];
  if (!page) return;

  const [stylesheet, script] = page;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `./css/${stylesheet}`;
  document.head.appendChild(link);

  const pageScript = document.createElement('script');
  pageScript.src = `./js/${script}`;
  pageScript.defer = false;
  document.body.appendChild(pageScript);
})();
