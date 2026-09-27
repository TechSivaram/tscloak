import { OidcFederationService } from './oidc-federation.service';

jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

describe('OidcFederationService federation callback URI', () => {
  const originalIssuer = process.env.OIDC_ISSUER;
  const downstreamRedirectUri =
    'http://localhost:3000/idp-client-admin/callback.html';
  const federationCallbackUri =
    'http://localhost:3000/api/federation/callback';
  const metadata = {
    issuer: 'https://accounts.google.com',
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint: 'https://oauth2.googleapis.com/token',
    jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
  };

  let service: OidcFederationService;

  beforeEach(() => {
    process.env.OIDC_ISSUER = 'http://localhost:3000';
    service = new OidcFederationService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    if (originalIssuer === undefined) {
      delete process.env.OIDC_ISSUER;
    } else {
      process.env.OIDC_ISSUER = originalIssuer;
    }
  });

  it('uses TSCloak callback instead of downstream redirect URI for authorization', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => metadata,
    } as Response);

    const authorizationUrl = await service.buildAuthorizationUrl(
      metadata.issuer,
      'google-client-id',
      ['openid', 'email'],
      'state-value',
      'nonce-value',
      'challenge-value',
    );
    const parsedAuthorizationUrl = new URL(authorizationUrl);

    expect(parsedAuthorizationUrl.searchParams.get('redirect_uri')).toBe(
      federationCallbackUri,
    );
    expect(authorizationUrl).not.toContain(downstreamRedirectUri);
  });

  it('uses the same TSCloak callback when exchanging the authorization code', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => metadata,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id_token: 'upstream-id-token' }),
      } as Response);

    await service.exchangeCode(
      metadata.issuer,
      'google-client-id',
      'google-client-secret',
      'authorization-code',
      'code-verifier',
    );

    const request = fetchMock.mock.calls[1][1];
    const body = request?.body as URLSearchParams;

    expect(body.get('redirect_uri')).toBe(federationCallbackUri);
    expect(body.get('redirect_uri')).not.toBe(downstreamRedirectUri);
  });
});
