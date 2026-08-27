import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import { Client } from './entities/client.entity';
import { ClientRepository } from './repositories/client.repository';

export interface CreateClientInput {
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
}

export interface CreatedClient {
  client: Client;
  clientSecret: string | null;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly clients: ClientRepository,
  ) {}

  async createClient(
    input: CreateClientInput,
  ): Promise<CreatedClient> {
    const clientId =
      randomBytes(24).toString('hex');

    const existing =
      await this.clients.findByClientId(
        clientId,
      );

    if (existing) {
      throw new ConflictException(
        'Client ID collision',
      );
    }

    let clientSecret: string | null = null;

    if (
      input.tokenEndpointAuthMethod !==
      'none'
    ) {
      clientSecret =
        randomBytes(48).toString('base64url');
    }

    const client = new Client();

    client.clientId = clientId;
    client.clientSecret = clientSecret;
    client.name = input.name;
    client.redirectUris = input.redirectUris;
    client.allowedScopes = input.allowedScopes;
    client.grantTypes = input.grantTypes;
    client.responseTypes =
      input.responseTypes;
    client.tokenEndpointAuthMethod =
      input.tokenEndpointAuthMethod;
    client.enabled = true;

    const saved =
      await this.clients.save(client);

    return {
      client: saved,
      clientSecret,
    };
  }
}