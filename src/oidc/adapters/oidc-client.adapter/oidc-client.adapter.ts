import { Client } from '../../../clients/entities/client.entity';
import { ClientRepository } from '../../../clients/repositories/client.repository';

export class OidcClientAdapter {
  constructor(
    private readonly clientRepository: ClientRepository,
  ) {}

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
      await this.clientRepository.findByClientId(clientId);

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
      await this.clientRepository.findByClientId(clientId);

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

    await this.clientRepository.save(client);
  }

  /**
   * Remove a dynamically registered client.
   *
   * Required for Dynamic Client Registration DELETE support.
   *
   * Currently intentionally left as a no-op until delete support
   * is added to ClientRepository.
   */
  async destroy(
    _clientId: string,
  ): Promise<void> {
    // DELETE support can be implemented later.
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

      redirect_uris: client.redirectUris,

      scope: client.allowedScopes.join(' '),

      grant_types: client.grantTypes,

      response_types: client.responseTypes,

      token_endpoint_auth_method:
        client.tokenEndpointAuthMethod,
    };
  }
}