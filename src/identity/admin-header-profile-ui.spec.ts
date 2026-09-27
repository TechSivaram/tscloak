import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('admin header profile rendering', () => {
  const idpCommon = read('public/idp-admin/js/admin-common.js');
  const idpDashboard = read('public/idp-admin/js/dashboard.js');
  const idpDashboardHtml = read('public/idp-admin/dashboard.html');
  const clientCommon = read('public/idp-client-admin/js/common.js');

  it('uses the safe profile endpoint and prefers its display name in both headers', () => {
    expect(idpCommon).toContain('apiFetch("/api/account/profile")');
    expect(clientCommon).toContain("api('/api/account/profile')");
    expect(idpCommon).toContain('profile.displayName || profile.username');
    expect(clientCommon).toContain('profile.displayName || profile.username');
    expect(idpDashboardHtml).toContain('./js/admin-common.js');
    expect(idpDashboard).not.toContain('userName.textContent');
    expect(clientCommon).not.toContain("api('/me')");
  });

  it('supports HTTPS avatars, accessible initials fallback, and failed-image fallback', () => {
    for (const script of [idpCommon, clientCommon]) {
      expect(script).toMatch(/url\.protocol !== ['\"]https:/);
      expect(script).toContain('profile.avatarUrl');
      expect(script).toContain('image.onerror = showFallback');
      expect(script).toContain('initials');
      expect(script).toContain('aria-label');
    }
    expect(read('public/idp-client-admin/css/client-admin.css')).toMatch(
      /\.header-avatar-image\s*\{[^}]*display:\s*block/s,
    );
  });

  it('keeps generated username out of the header and preserves logout behavior', () => {
    expect(idpCommon).not.toContain('user?.username');
    expect(idpCommon).toContain('function logout()');
    expect(idpCommon).toContain('window.location.href = "/idp-admin/"');
    expect(idpDashboard).toContain('`/session/end?${params.toString()}`');
    expect(clientCommon).toContain('const logout = () =>');
    expect(clientCommon).toContain('location.href = `/session/end?${params.toString()}`');
    expect(clientCommon).toContain("logoutButton.addEventListener('click', logout)");
  });
});
