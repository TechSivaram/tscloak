import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(
  resolve(process.cwd(), 'public/idp-client-admin/css/client-admin.css'),
  'utf8',
);
const settingsHtml = readFileSync(
  resolve(process.cwd(), 'public/idp-client-admin/settings.html'),
  'utf8',
);
const federationHtml = readFileSync(
  resolve(process.cwd(), 'public/idp-client-admin/federation.html'),
  'utf8',
);
const commonJs = readFileSync(
  resolve(process.cwd(), 'public/idp-client-admin/js/common.js'),
  'utf8',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('Client Admin page scroll layout', () => {
  it('keeps the desktop shell and sidebar at viewport height with content scrolling on the right', () => {
    expect(rule('.app-shell')).toMatch(/height:\s*100vh/);
    expect(rule('.app-shell')).toMatch(/overflow:\s*hidden/);
    expect(rule('.sidebar')).toMatch(/height:\s*100vh/);
    expect(rule('.sidebar')).toMatch(/display:\s*flex/);
    expect(rule('.sidebar')).toMatch(/flex-direction:\s*column/);
    expect(rule('.sidebar nav.navigation')).toMatch(/flex:\s*1 1 auto/);
    expect(rule('.sidebar nav.navigation')).toMatch(/min-height:\s*0/);
    expect(rule('.sidebar nav.navigation')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.sidebar-footer')).toMatch(/margin-top:\s*auto/);
    expect(rule('.signout')).toMatch(/flex:\s*0 0 auto/);
    expect(rule('.main-area')).toMatch(/height:\s*100vh/);
    expect(rule('.main-area')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.main-area')).toMatch(/overflow-x:\s*hidden/);
  });

  it('restores the existing document scrolling behavior on mobile', () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?body\s*\{[^}]*overflow:\s*auto/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.sidebar\s*\{[^}]*height:\s*100vh/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.main-area\s*\{[^}]*overflow:\s*visible/s,
    );
    expect(settingsHtml).toContain('<aside class="sidebar">');
    expect(settingsHtml).toContain('class="signout" data-logout');
    expect(settingsHtml).toContain('<div class="main-area">');
  });

  it('uses the IDP Admin off-canvas drawer pattern on small screens', () => {
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.sidebar\s*\{[^}]*position:\s*fixed/s,
    );
    expect(css).toMatch(
      /\.sidebar\.open\s*\{[^}]*transform:\s*translateX\(0\)/s,
    );
    expect(css).toMatch(/\.mobile-overlay\.visible\s*\{[^}]*display:\s*block/s);
    expect(css).toMatch(/\.menu-button\s*\{[^}]*display:\s*none/s);
    expect(css).toMatch(
      /@media\s*\(max-width:\s*760px\)[\s\S]*?\.menu-button\s*\{[^}]*display:\s*block/s,
    );
    expect(css).toMatch(
      /\.sidebar nav\.navigation\s*\{[^}]*overflow-y:\s*auto/s,
    );
    expect(css).toMatch(/\.sidebar-footer\s*\{[^}]*margin-top:\s*auto/s);
    expect(commonJs).toContain("overlay.addEventListener('click', close)");
    expect(commonJs).toContain("if (event.key === 'Escape') close()");
    expect(commonJs).toContain("link.addEventListener('click', close)");
    expect(commonJs).toContain(
      "button.setAttribute('aria-expanded', String(open))",
    );
  });

  it('collapses tablet forms and reflows Federation rows into responsive cards', () => {
    expect(css).toMatch(
      /@media\s*\(min-width:\s*761px\)\s*and\s*\(max-width:\s*900px\)[\s\S]*?\.field-grid,\s*form,\s*\.profile dl\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(css).toMatch(
      /@media\s*\(max-width:\s*900px\)[\s\S]*?\.client-federation-page \.table-wrap\s*\{[^}]*overflow:\s*visible/s,
    );
    expect(css).toMatch(
      /\.client-federation-page tbody tr\s*\{[^}]*display:\s*block/s,
    );
    expect(css).toMatch(
      /\.client-federation-page tbody td:nth-child\(1\)::before\s*\{[^}]*content:\s*'Provider'/s,
    );
    expect(css).toMatch(
      /\.client-federation-page tbody td:nth-child\(4\)\s*\{[^}]*flex-wrap:\s*wrap/s,
    );
    expect(css).toMatch(
      /\.client-federation-page tbody td\s*\{[^}]*overflow-wrap:\s*anywhere/s,
    );
    expect(css).toMatch(
      /\.client-federation-page tbody td button\s*\{[^}]*min-height:\s*42px/s,
    );
    expect(federationHtml).toContain('class="client-federation-page"');
  });
});
