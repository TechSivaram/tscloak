function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderFederationLoginButton(
  providerName: string,
  authorizeUrl: string,
): string {
  const icon =
    providerName.trim().toLowerCase() === 'google'
      ? '<img class="federation-provider-icon" src="/assets/google-g.svg" alt="" aria-hidden="true" width="18" height="18">'
      : '';

  return `<a class="federation-button" href="${escapeHtml(authorizeUrl)}"><span class="federation-button-content">${icon}<span>Continue with ${escapeHtml(providerName)}</span></span></a>`;
}
