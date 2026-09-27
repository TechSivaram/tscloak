import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const adminPublic = resolve(process.cwd(), 'public/idp-admin');
const read = (path: string) => readFileSync(resolve(adminPublic, path), 'utf8');

describe('IDP Admin sidebar navigation', () => {
  const sidebarPages = readdirSync(adminPublic)
    .filter((file) => file.endsWith('.html'))
    .map((file) => ({ file, html: read(file) }))
    .filter(({ html }) => html.includes('class="sidebar"'));
  const common = read('js/admin-common.js');

  it('loads the shared navigation utility on every page with a sidebar', () => {
    expect(sidebarPages.length).toBeGreaterThan(0);
    for (const { file, html } of sidebarPages) {
      expect(html).toContain('admin-common.js');
      expect(html).toContain('class="navigation"');
      expect(html).toContain('href="./dashboard.html"');
      expect(html).toContain('href="./clients.html"');
      expect(html).toContain('href="./users.html"');
      expect(html).toContain('href="./roles.html"');
      expect(html).toContain('href="./initial-access-tokens.html"');
      expect(html).toContain('href="./security-policy.html"');
      expect(file).toBeTruthy();
    }
  });

  it('inserts Federation once, with the standard nav item structure before Registration', () => {
    expect(common).toContain('function ensureSidebarNavigation()');
    expect(common).toContain('a.nav-item[href="./federation.html"]');
    expect(common).toContain('federationLinks.forEach((link, index)');
    expect(common).toContain('if (index > 0) link.remove()');
    expect(common).toContain('federationLink.className = "nav-item"');
    expect(common).toContain('federationLink.append(icon, document.createTextNode("Federation"))');
    expect(common).toContain('navigation.insertBefore(federationLink, registrationSection || null)');

    for (const { html } of sidebarPages) {
      const federationItems = html.match(/href="\.\/federation\.html"/g) || [];
      expect(federationItems.length).toBeLessThanOrEqual(1);
    }
  });

  it('sets the active class from the current page URL while preserving existing links', () => {
    expect(common).toContain(
      'link.classList.toggle("active", new URL(link.href).pathname === currentPath)',
    );
    expect(read('dashboard.html')).toContain(
      '<a class="nav-item active" href="./dashboard.html">',
    );
    expect(read('clients.html')).toContain('href="./clients.html"');
    expect(read('users.html')).toContain('href="./users.html"');
    expect(read('roles.html')).toContain('href="./roles.html"');
    expect(read('federation.html')).toContain('href="./federation.html"');
    expect(read('initial-access-tokens.html')).toContain(
      'href="./initial-access-tokens.html"',
    );
    expect(read('security-policy.html')).toContain(
      'href="./security-policy.html"',
    );
  });

  it('normalizes one shared Admin Console footer after navigation on every sidebar page', () => {
    expect(common).toContain('function ensureSidebarFooter()');
    expect(common).toContain('sidebar.querySelectorAll(".sidebar-footer")');
    expect(common).toContain('if (index > 0) item.remove()');
    expect(common).toContain('title.textContent = "Admin Console"');
    expect(common).toContain('subtitle.textContent = "Authenticated session"');
    expect(common).toContain('navigation.after(footer)');
    expect(common.indexOf('ensureSidebarNavigation();')).toBeLessThan(
      common.indexOf('ensureSidebarFooter();'),
    );

    for (const { html } of sidebarPages) {
      const footers = html.match(/class="sidebar-footer"/g) || [];
      expect(footers.length).toBeLessThanOrEqual(1);
    }

    const css = read('css/dashboard.css');
    expect(css).toMatch(/\.sidebar-footer\s*\{[^}]*margin-top:\s*auto/s);
    expect(css).toMatch(/\.sidebar-footer\s*\{[^}]*flex-shrink:\s*0/s);
  });
});
