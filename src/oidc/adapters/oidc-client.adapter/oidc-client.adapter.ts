import { ClientRepository } from '../../../clients/repositories/client.repository';

export class OidcClientAdapter {
  constructor(
    private readonly clientRepository: ClientRepository,
  ) { }

  async find(
    clientId: string,
  ): Promise<Record<string, unknown> | undefined> {
    const client =
      await this.clientRepository.findByClientId(
        clientId,
      );

    if (!client || !client.enabled) {
      return undefined;
    }

    return {
      client_id: client.clientId,
      client_secret: client.clientSecret ?? undefined,

      client_name: client.name,

      redirect_uris:
        client.redirectUris,

      scope:
        client.allowedScopes.join(' '),

      grant_types:
        client.grantTypes,

      response_types:
        client.responseTypes,

      token_endpoint_auth_method:
        client.tokenEndpointAuthMethod,
    };
  }
}