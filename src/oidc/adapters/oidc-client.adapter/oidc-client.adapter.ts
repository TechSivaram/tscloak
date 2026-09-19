import { Client } from '../../../clients/entities/client.entity';
import { InteractionMode } from '../../../clients/enums/interaction-mode.enum';
import { ClientsService } from '../../../clients/clients.service';
import { ConfigService } from '@nestjs/config';

export class OidcClientAdapter {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly config: ConfigService,
  ) { }

  /**
   * Find a client by client_id.
   *
   * Called by oidc-provider during:
   * - authorization
   * - token exchange
   * - client authentication
   * - dynamic client registration management
   */
  async find(
    clientId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const client =
      await this.clientsService.findByClientId(clientId);

    if (!client || !client.enabled) {
      return undefined;
    }

    return this.toOidcClient(client);
  }

  /**
   * Create or update a dynamically registered client.
   *
   * Called by oidc-provider Dynamic Client Registration endpoint.
   */
  async upsert(
    clientId: string,
    payload: Record<string, unknown>,
    _expiresIn?: number,
  ): Promise<void> {
    let client =
      await this.clientsService.findByClientId(clientId);

    if (!client) {
      client = new Client();

      client.clientId = clientId;
      client.enabled = true;
    }

    client.clientSecret =
      typeof payload.client_secret === 'string'
        ? payload.client_secret
        : null;

    client.name =
      typeof payload.client_name === 'string'
        ? payload.client_name
        : clientId;

    client.redirectUris =
      Array.isArray(payload.redirect_uris)
        ? payload.redirect_uris.map(String)
        : [];

    /*
     * OIDC RP-Initiated Logout
     *
     * Persist the redirect URIs that the client is
     * allowed to use after logout.
     */
    client.postLogoutRedirectUris =
      Array.isArray(payload.post_logout_redirect_uris)
        ? payload.post_logout_redirect_uris.map(String)
        : [];

    client.allowedScopes =
      typeof payload.scope === 'string'
        ? payload.scope.split(' ').filter(Boolean)
        : [];

    client.grantTypes =
      Array.isArray(payload.grant_types)
        ? payload.grant_types.map(String)
        : ['authorization_code'];

    client.responseTypes =
      Array.isArray(payload.response_types)
        ? payload.response_types.map(String)
        : ['code'];

    client.tokenEndpointAuthMethod =
      typeof payload.token_endpoint_auth_method === 'string'
        ? payload.token_endpoint_auth_method
        : 'none';

    /**
     * TSCloak-specific interaction configuration
     */
    client.interactionMode =
      payload.interaction_mode === InteractionMode.EXTERNAL
        ? InteractionMode.EXTERNAL
        : InteractionMode.HOSTED;

    client.interactionLoginUrl =
      typeof payload.interaction_login_url === 'string'
        ? payload.interaction_login_url
        : null;

    client.interactionConsentUrl =
      typeof payload.interaction_consent_url === 'string'
        ? payload.interaction_consent_url
        : null;

    await this.clientsService.save(client);
  }

  /**
   * Remove a dynamically registered client.
   *
   * Required for Dynamic Client Registration DELETE support.
   */
  async destroy(clientId: string): Promise<void> {
    await this.clientsService.deleteByClientId(clientId);
  }

  /**
   * Convert our domain Client entity into the format expected
   * by oidc-provider.
   */
  private toOidcClient(
    client: Client,
  ): Record<string, unknown> {
    return {
      client_id: client.clientId,

      ...(client.clientSecret
        ? {
          client_secret: client.clientSecret,
        }
        : {}),

      client_name: client.name,

      redirect_uris: client.redirectUris ?? [],

      /*
       * OIDC RP-Initiated Logout
       *
       * oidc-provider uses this list to validate
       * post_logout_redirect_uri.
       */
      post_logout_redirect_uris: client.postLogoutRedirectUris ?? [],

      scope: client.allowedScopes.join(' '),

      grant_types: client.grantTypes,

      response_types: client.responseTypes,

      token_endpoint_auth_method:
        client.tokenEndpointAuthMethod,

      /**
       * TSCloak-specific metadata
       */
      interaction_mode: client.interactionMode,

      ...(client.interactionLoginUrl
        ? {
          interaction_login_url:
            client.interactionLoginUrl,
        }
        : {}),

      ...(client.interactionConsentUrl
        ? {
          interaction_consent_url:
            client.interactionConsentUrl,
        }
        : {}),
    };
  }
}