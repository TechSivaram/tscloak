import { readFileSync } from 'fs';
import { resolve } from 'path';

function readPublic(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Federation administration UI', () => {
  const idpHtml = readPublic('public/idp-admin/federation.html');
  const idpDashboardHtml = readPublic('public/idp-admin/dashboard.html');
  const idpScript = readPublic('public/idp-admin/js/federation.js');
  const idpCommon = readPublic('public/idp-admin/js/admin-common.js');
  const pageLoader = readPublic('public/idp-admin/js/admin-page-loader.js');
  const clientHtml = readPublic('public/idp-client-admin/federation.html');
  const clientScript = readPublic('public/idp-client-admin/js/federation.js');
  const clientCommon = readPublic('public/idp-client-admin/js/common.js');

  it('renders the Federation navigation item with the existing IDP sidebar pattern', () => {
    const navItems = (html: string) => {
      const nav = html.match(/<nav class="navigation">([\s\S]*?)<\/nav>/)?.[1];
      return [...(nav || '').matchAll(/<a class="nav-item(?: active)?"[^>]*>[\s\S]*?<\/a>/g)]
        .map(([item]) => item.replace(' class="nav-item active"', ' class="nav-item"').replace(/\s+/g, ' ').trim());
    };
    expect(navItems(idpHtml)).toEqual(navItems(idpDashboardHtml));
    expect(idpHtml).toContain(
      '<a class="nav-item active" href="./federation.html"><span aria-hidden="true">⇄</span>Federation</a>',
    );
    expect(idpDashboardHtml).toContain(
      '<a class="nav-item" href="./federation.html"><span aria-hidden="true">⇄</span>Federation</a>',
    );
    expect(pageLoader).toContain(
      "'federation.html': ['federation.css', 'federation.js']",
    );
    expect(idpHtml).toContain('id="providerRows"');
  });

  it('provides IDP Admin create/edit fields and blank-secret preservation', () => {
    for (const field of [
      'name',
      'type',
      'issuer',
      'clientId',
      'clientSecret',
      'scopes',
      'enabled',
    ]) {
      expect(idpHtml).toContain(`name="${field}"`);
    }
    expect(idpScript).toContain('function openEdit');
    expect(idpScript).toContain('form.elements.clientSecret.value =');
    expect(idpScript).toContain(
      'if (!editingId || secret) payload.clientSecret = secret',
    );
    expect(idpScript).toContain("method: 'DELETE'");
    expect(idpScript).toContain('window.confirm(');
    expect(idpScript).toContain('data-toggle');
    expect(idpScript).toContain("method: editingId ? 'PATCH' : 'POST'");
  });

  it('limits Client Admin to availability controls and adds its navigation entry', () => {
    expect(clientCommon).toContain('federation.html');
    expect(clientHtml).toContain('id="providerRows"');
    expect(clientScript).toContain("'/api/federation/client/providers'");
    expect(clientScript).toContain("method: 'PATCH'");
    expect(clientScript).not.toContain('clientSecret');
    expect(clientScript).not.toContain('issuer');
    expect(clientScript).not.toContain("method: 'DELETE'");
  });
});
