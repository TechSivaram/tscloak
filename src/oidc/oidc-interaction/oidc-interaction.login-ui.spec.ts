import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderFederationLoginButton } from './federation-login-button';

describe('OIDC interaction federation sign-in buttons', () => {
  const template = readFileSync(
    resolve(process.cwd(), 'src/oidc/views/login.html'),
    'utf8',
  );

  it('renders the decorative Google icon inside the centered button content', () => {
    const markup = renderFederationLoginButton(
      'Google',
      '/api/federation/providers/google/authorize?client_id=client-id',
    );
    const icon = readFileSync(
      resolve(process.cwd(), 'public/assets/google-g.svg'),
      'utf8',
    );

    expect(markup).toContain('class="federation-provider-icon"');
    expect(markup).toContain(
      'alt="" aria-hidden="true" width="18" height="18"',
    );
    expect(markup).toContain('Continue with Google');
    expect(markup).toContain(
      'href="/api/federation/providers/google/authorize?client_id=client-id"',
    );
    expect(icon).toContain('#4285F4');
    expect(icon).toContain('#EA4335');
    expect(template).toMatch(
      /\.federation-button-content\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center/s,
    );
    expect(template).toContain('.federation-divider::before');
    expect(template).toContain(
      '<div class="federation-divider"><span>or</span></div>',
    );
  });

  it('centers other provider labels without using the Google icon', () => {
    const markup = renderFederationLoginButton('Contoso', '/authorize');

    expect(markup).toContain('Continue with Contoso');
    expect(markup).not.toContain('federation-provider-icon');
  });

  it('escapes provider labels and authorization URLs', () => {
    const markup = renderFederationLoginButton(
      '<img src=x onerror=alert(1)>',
      '/authorize?next="unsafe"&other=1',
    );

    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).toContain('&quot;unsafe&quot;&amp;other=1');
    expect(markup).not.toContain('<img src=x');
  });
});
