import request from 'supertest';
import { App } from 'supertest/types';

interface OidcLoginOptions {
  clientId: string;
  username: string;
  password: string;
  redirectUri: string;
}

export async function oidcLogin(
  server: App,
  options: OidcLoginOptions,
): Promise<string> {
  const authorization = await request(server)
    .get('/auth')
    .query({
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      response_type: 'code',
      scope: 'openid profile email roles',
      state: 'e2e-state',
    })
    .redirects(0);

  expect([302, 303]).toContain(authorization.status);

  const location = authorization.headers.location;

  expect(location).toBeDefined();
  expect(location).toContain('/interaction/');

  const interactionUrl = new URL(location, 'http://localhost:3000');

  const uid = interactionUrl.pathname.split('/').pop();

  expect(uid).toBeTruthy();

  await request(server)
    .post(`/interaction/${uid}/login`)
    .send({
      username: options.username,
      password: options.password,
    })
    .expect((response) => {
      expect([302, 303]).toContain(response.status);
    });

  /*
   * The interaction completion redirects back to the OIDC
   * authorization endpoint. The browser would follow this
   * automatically; supertest does not, so we continue the flow.
   */
  const resumed = await request(server).get(`/interaction/${uid}`).redirects(0);

  expect([302, 303]).toContain(resumed.status);

  const consentLocation = resumed.headers.location;

  expect(consentLocation).toBeDefined();

  const consentUrl = new URL(consentLocation, 'http://localhost:3000');

  /*
   * If the provider requires consent, complete it.
   */
  if (consentUrl.pathname.startsWith('/interaction/')) {
    const consentUid = consentUrl.pathname.split('/').pop();

    expect(consentUid).toBeTruthy();

    await request(server)
      .post(`/interaction/${consentUid}/consent`)
      .send({
        decision: 'accept',
      })
      .expect((response) => {
        expect([302, 303]).toContain(response.status);
      });
  }

  throw new Error(
    'OIDC login helper needs the authorization resume URL handling completed.',
  );
}
