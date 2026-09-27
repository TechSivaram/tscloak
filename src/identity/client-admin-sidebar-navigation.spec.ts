import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const publicRoot = resolve(process.cwd(), 'public/idp-client-admin');
const read = (path: string) => readFileSync(resolve(publicRoot, path), 'utf8');
const hrefs = [
  './dashboard.html',
  './users.html',
  './settings.html',
  './federation.html',
  './profile.html',
];

class FakeLink {
  readonly href: string;
  readonly originalMarkup: string;
  readonly classes = new Set<string>();
  parent: FakeNav | null = null;

  constructor(href: string, markup: string, active: boolean) {
    this.href = href;
    this.originalMarkup = markup;
    if (active) this.classes.add('active');
  }

  get classList() {
    return {
      toggle: (name: string, force: boolean) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
      },
      contains: (name: string) => this.classes.has(name),
    };
  }

  hasAttribute(name: string) {
    return name === 'href' && this.href.length > 0;
  }

  getAttribute(name: string) {
    return name === 'href' ? this.href : null;
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
  const preservedLinks = new Map(
    nav.children.map((link) => [link.href, link]),
  );
  if (addDuplicateFederation) {
    nav.children.push(new FakeLink('./federation.html', 'duplicate', false));
    nav.children[nav.children.length - 1].parent = nav;
  }

  const document = {
    querySelectorAll(selector: string) {
      if (selector === '.sidebar nav') return [nav];
      return [];
    },
    createElement(tag: string) {
      if (tag !== 'a') throw new Error(`Unexpected element: ${tag}`);
      return new FakeLink('', '', false);
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
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    location: { href: '' },
    console,
  });
  return { nav, preservedLinks, activeHref: pathname.split('/').pop() };
}

describe('Client Admin sidebar navigation', () => {
  const pages = readdirSync(publicRoot)
    .filter((file) => file.endsWith('.html'))
    .filter((file) => read(file).includes('js/common.js'));

  it.each(pages)('%s has the same ordered navigation', (page) => {
    const { nav, activeHref } = executeNavigation(page);
    expect(nav.children.map((link) => link.href)).toEqual(hrefs);
    expect(nav.children.filter((link) => link.href === './federation.html')).toHaveLength(1);
    expect(nav.children.filter((link) => link.classList.contains('active')).map((link) => link.href)).toEqual([
      `./${activeHref}`,
    ]);
  });

  it('moves an existing Federation link after settings without replacing existing links', () => {
    const { nav, preservedLinks } = executeNavigation('settings.html', true);
    expect(nav.children.map((link) => link.href)).toEqual(hrefs);
    expect(nav.children.filter((link) => link.href === './federation.html')).toHaveLength(1);
    for (const [href, original] of preservedLinks) {
      expect(nav.children.find((link) => link.href === href)).toBe(original);
      expect(original.originalMarkup).toBeTruthy();
    }
    expect(nav.children[3].href).toBe('./federation.html');
    expect(nav.children[4].href).toBe('./profile.html');
  });
});
