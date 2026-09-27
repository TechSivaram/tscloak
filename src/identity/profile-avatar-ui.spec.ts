import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const profileName = 'Sivaramakrishna Movva';

function createElement() {
  const attributes: Record<string, string> = {};
  return {
    hidden: true,
    textContent: '',
    src: '',
    alt: '',
    onerror: null as null | (() => void),
    attributes,
    removeAttribute(name: string) {
      delete attributes[name];
      if (name === 'src') this.src = '';
    },
    setAttribute(name: string, value: string) {
      attributes[name] = value;
    },
  };
}

const profilePages = [
  {
    script: 'public/idp-admin/js/profile.js',
    imageId: 'profileAvatar',
    fallbackId: 'profileAvatarFallback',
    globalName: 'Admin',
  },
  {
    script: 'public/idp-client-admin/js/profile.js',
    imageId: 'avatar',
    fallbackId: 'avatarFallback',
    globalName: 'ClientAdmin',
  },
];

describe.each(profilePages)('$script avatar fallback', (page) => {
  async function render(avatarUrl: string | null) {
    const image = createElement();
    const fallback = createElement();
    const elements: Record<string, ReturnType<typeof createElement>> = {
      [page.imageId]: image,
      [page.fallbackId]: fallback,
      profileName: createElement(),
      profileUsername: createElement(),
      profileEmail: createElement(),
      profileRoles: createElement(),
      profileClient: createElement(),
      profileFederation: createElement(),
      displayName: createElement(),
      username: createElement(),
      email: createElement(),
      roles: createElement(),
      client: createElement(),
      federation: createElement(),
    };
    const profile = {
      username: 'federated_generated',
      displayName: profileName,
      email: 'user@example.test',
      avatarUrl,
      roles: ['USER'],
      client: { id: 'client-1', name: 'Portal' },
      federation: { providerName: 'Google', providerType: 'oidc' },
    };
    const fetchProfile = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => profile,
    });
    const document = {
      readyState: 'complete',
      getElementById: (id: string) => elements[id],
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: jest.fn(),
    };
    const script = readFileSync(resolve(process.cwd(), page.script), 'utf8');

    const api =
      page.globalName === 'Admin'
        ? { apiFetch: fetchProfile, showMessage: jest.fn() }
        : { api: fetchProfile };

    runInNewContext(script, {
      document,
      URL,
      [page.globalName]: api,
    });
    await new Promise((resolve) => setImmediate(resolve));

    return { image, fallback, fetchProfile };
  }

  it('shows accessible initials immediately when no picture URL is available', async () => {
    const { image, fallback } = await render(null);

    expect(image.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
    expect(fallback.textContent).toBe('SM');
    expect(fallback.attributes['aria-label']).toBe(
      'Sivaramakrishna Movva initials',
    );
  });

  it('keeps a valid HTTPS picture and falls back when it fails to load', async () => {
    const { image, fallback } = await render(
      'https://images.example.test/profile.png',
    );

    expect(image.src).toBe('https://images.example.test/profile.png');
    expect(image.hidden).toBe(false);
    expect(image.alt).toBe('Sivaramakrishna Movva profile picture');
    expect(fallback.hidden).toBe(true);

    image.onerror?.();

    expect(image.hidden).toBe(true);
    expect(image.src).toBe('');
    expect(fallback.hidden).toBe(false);
    expect(fallback.textContent).toBe('SM');
  });
});
