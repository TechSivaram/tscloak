import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const publicRoot = resolve(process.cwd(), 'public/idp-client-admin');
const read = (path: string) => readFileSync(resolve(publicRoot, path), 'utf8');
const clientCss = read('css/client-admin.css');
const idpCss = readFileSync(
  resolve(process.cwd(), 'public/idp-admin/css/dashboard.css'),
  'utf8',
);
const hrefs = [
  './dashboard.html',
  './users.html',
  './settings.html',
  './federation.html',
  './profile.html',
];

class FakeElement {
  className = '';
  textContent = '';
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();

  constructor(readonly tagName = 'div') {}

  get firstChild() {
    return this.children[0];
  }

  get classList() {
    const classes = new Set(this.className.split(/\s+/).filter(Boolean));
    return {
      add: (name: string) => {
        classes.add(name);
        this.className = [...classes].join(' ');
      },
      toggle: (name: string, force: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        this.className = [...classes].join(' ');
      },
      contains: (name: string) => classes.has(name),
    };
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children: FakeElement[]) {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  querySelector(selector: string): FakeElement | null {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    return (
      this.children.find((child) =>
        className
          ? child.className.split(/\s+/).includes(className)
          : child.tagName === selector,
      ) || null
    );
  }
}

class FakeLink extends FakeElement {
  readonly href: string;
  readonly originalMarkup: string;
  parent: FakeNav | null = null;

  constructor(href: string, markup: string, active: boolean) {
    super('a');
    this.href = href;
    this.originalMarkup = markup;
    this.textContent = markup.replace(/<[^>]*>/g, '').trim();
    if (active) this.className = 'active';
  }

  hasAttribute(name: string) {
    return name === 'href' && this.href.length > 0;
  }

  getAttribute(name: string) {
    return name === 'href' ? this.href : null;
  }

  insertBefore(child: FakeElement) {
    this.children.unshift(child);
  }

  remove() {
    this.parent?.remove(this);
  }

  after(other: FakeLink) {
    this.parent?.insertAfter(this, other);
  }
}

class FakeNav {
  readonly children: FakeLink[];
  readonly classList = new FakeElement().classList;

  constructor(children: FakeLink[]) {
    this.children = children;
    children.forEach((child) => (child.parent = this));
  }

  querySelectorAll(selector: string): FakeLink[] {
    if (selector === 'a[href$=".html"]') return [...this.children];
    const href = selector.match(/^a\[href="(.+)"\]$/)?.[1];
    return href ? this.children.filter((child) => child.href === href) : [];
  }

  prepend(link: FakeLink) {
    this.remove(link);
    this.children.unshift(link);
    link.parent = this;
  }

  insertAfter(reference: FakeLink, link: FakeLink) {
    this.remove(link);
    const index = this.children.indexOf(reference);
    this.children.splice(index + 1, 0, link);
    link.parent = this;
  }

  remove(link: FakeLink) {
    const index = this.children.indexOf(link);
    if (index >= 0) this.children.splice(index, 1);
    link.parent = null;
  }
}

class FakeSidebar {
  footer: FakeElement | null = null;

  constructor(
    private readonly brand: FakeElement,
    private readonly signout: FakeElement,
  ) {}

  querySelector(selector: string) {
    if (selector === '.brand') return this.brand;
    if (selector === '.sidebar-footer') return this.footer;
    return null;
  }

  querySelectorAll(selector: string) {
    return selector === '.signout' ? [this.signout] : [];
  }

  appendChild(child: FakeElement) {
    if (child.className === 'sidebar-footer') this.footer = child;
    return child;
  }
}

function linksFromPage(html: string): FakeLink[] {
  const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '';
  return [...nav.matchAll(/<a([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const href = match[1].match(/href="([^"]+)"/)?.[1] || '';
    return new FakeLink(href, match[2], /class="active"/.test(match[1]));
  });
}

function executeNavigation(page: string, addDuplicateFederation = false) {
  const html = read(page);
  const nav = new FakeNav(linksFromPage(html));
  const preservedLinks = new Map(nav.children.map((link) => [link.href, link]));
  if (addDuplicateFederation) {
    nav.children.push(new FakeLink('./federation.html', 'duplicate', false));
    nav.children[nav.children.length - 1].parent = nav;
  }

  const brand = new FakeElement();
  brand.appendChild(new FakeElement('img'));
  const signout = new FakeElement('button');
  signout.className = 'signout';
  const sidebar = new FakeSidebar(brand, signout);

  const document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === '.sidebar nav') return [nav];
      if (selector === '.sidebar') return [sidebar];
      return [];
    },
    createElement(tag: string) {
      if (tag === 'a') return new FakeLink('', '', false);
      return new FakeElement(tag);
    },
  };
  const common = read('js/common.js');
  const pathname = `/idp-client-admin/${page}`;
  runInNewContext(common, {
    document,
    window: {
      location: {
        pathname,
        origin: 'http://localhost:3000',
        href: `http://localhost:3000${pathname}`,
      },
    },
    sessionStorage: { getItem: () => 'test-token' },
    URL,
    URLSearchParams,
    Headers,
    fetch: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    location: { href: '' },
    console,
  });
  return {
    nav,
    sidebar,
    brand,
    preservedLinks,
    activeHref: pathname.split('/').pop(),
  };
}

describe('Client Admin sidebar navigation', () => {
  const pages = readdirSync(publicRoot)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => read(file).includes('js/common.js'));

  it.each(pages)('%s has the same ordered navigation', (page) => {
    const { nav, sidebar, brand, activeHref } = executeNavigation(page);
    expect(nav.children.map((link) => link.href)).toEqual(hrefs);
    expect(
      nav.children.filter((link) => link.href === './federation.html'),
    ).toHaveLength(1);
    expect(
      nav.children.every((link) => link.classList.contains('nav-item')),
    ).toBe(true);
    expect(
      nav.children.every((link) => Boolean(link.querySelector('span'))),
    ).toBe(true);
    expect(
      nav.children
        .filter((link) => link.classList.contains('active'))
        .map((link) => link.href),
    ).toEqual([`./${activeHref}`]);
    expect(nav.classList.contains('navigation')).toBe(true);
    expect(brand.querySelector('.brand-mark')).not.toBeNull();
    expect(sidebar.footer?.className).toBe('sidebar-footer');
    expect(sidebar.footer?.children[0]).toBeTruthy();
  });

  it('moves an existing Federation link after settings without replacing existing links', () => {
    const { nav, preservedLinks } = executeNavigation('settings.html', true);
    expect(nav.children.map((link) => link.href)).toEqual(hrefs);
    expect(
      nav.children.filter((link) => link.href === './federation.html'),
    ).toHaveLength(1);
    for (const [href, original] of preservedLinks) {
      expect(nav.children.find((link) => link.href === href)).toBe(original);
      expect(original.originalMarkup).toBeTruthy();
    }
    expect(nav.children[3].href).toBe('./federation.html');
    expect(nav.children[4].href).toBe('./profile.html');
  });

  it('uses the established IDP sidebar palette, dimensions, and row spacing', () => {
    expect(idpCss).toMatch(/--sidebar:\s*#0b6f08/i);
    expect(clientCss).toMatch(/--sidebar:\s*#0b6f08/i);
    expect(clientCss).toMatch(/--active:\s*#ff9933/i);
    expect(clientCss).toMatch(/--sidebar-width:\s*250px/);
    expect(clientCss).toMatch(/\.brand\s*\{[^}]*height:\s*76px/s);
    expect(clientCss).toMatch(/\.brand-mark\s*\{[^}]*width:\s*40px/s);
    expect(clientCss).toMatch(
      /\.sidebar nav \.nav-item\s*\{[^}]*min-height:\s*42px/s,
    );
    expect(clientCss).toMatch(/\.sidebar nav \.nav-item\s*\{[^}]*gap:\s*11px/s);
    expect(clientCss).toMatch(
      /\.sidebar nav \.nav-item\.active\s*\{[^}]*background:\s*var\(--active\)/s,
    );
  });

  it('adds the shared responsive menu button to each navigation page', () => {
    for (const page of pages) {
      const html = read(page);
      expect(html).toContain('class="main-area"');
      expect(html).toContain('<header>');
    }
    const common = read('js/common.js');
    expect(common).toContain("button.className = 'menu-button'");
    expect(common).toContain(
      "button.setAttribute('aria-controls', sidebar.id)",
    );
    expect(common).toContain("overlay.className = 'mobile-overlay'");
    expect(common).toContain("overlay.classList.toggle('visible', open)");
    expect(common).toContain("if (event.key === 'Escape') close()");
    expect(common).toContain('window.innerWidth > 760');
  });
});
