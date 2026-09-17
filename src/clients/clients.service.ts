import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import { Client } from './entities/client.entity';
import { InteractionMode } from './enums/interaction-mode.enum';
import { ClientPortal } from './enums/client-portal.enum';
import { ClientRepository } from './repositories/client.repository';

export interface CreateClientInput {
  name: string;

  redirectUris: string[];

  /*
   * OIDC RP-Initiated Logout
   */
  postLogoutRedirectUris?: string[];

  allowedScopes: string[];

  grantTypes: string[];

  responseTypes: string[];

  tokenEndpointAuthMethod: string;

  interactionMode?: InteractionMode;

  interactionLoginUrl?: string;

  interactionConsentUrl?: string;

  portalType?: ClientPortal;
}

export interface CreatedClient {
  client: Client;
  clientSecret: string | null;
}

export type UpdateClientInput = Partial<CreateClientInput>;
export interface ClientStatusUpdate {
  enabled?: boolean;
}

@Injectable()
export class ClientsService {
  async count(): Promise<number> {
    return this.clients.count();
  }

  async findAll(): Promise<Client[]> {
    return this.clients.findAll();
  }

  async findClientForCallback(
    callbackPath: string,
  ): Promise<Client | null> {
    const clients = await this.findAll();
    return clients.find(client => client.redirectUris.some(uri => {
      try {
        return new URL(uri).pathname === callbackPath;
      } catch {
        return false;
      }
    })) ?? null;
  }

  async findClientForPortal(
    portal: ClientPortal,
    callbackPath: string,
  ): Promise<Client | null> {
    const clients = await this.findAll();
    return clients.find(client => client.portalType === portal)
      ?? clients.find(client => client.portalType === ClientPortal.NONE
        && client.redirectUris.some(uri => {
          try {
            return new URL(uri).pathname === callbackPath;
          } catch {
            return false;
          }
        }))
      ?? null;
  }

    async requiredRoleForClient(
      clientId: string,
    ): Promise<string | null> {
      const client = await this.findByClientId(clientId);

      if (!client) {
        return null;
      }

      if (client.portalType === ClientPortal.ADMIN) {
        return 'IDP_ADMIN';
      }

      if (client.portalType === ClientPortal.CLIENT_ADMIN) {
        return 'CLIENT_ADMIN';
      }

      const paths = client.redirectUris.map(uri => {
        try {
          return new URL(uri).pathname;
        } catch {
          return '';
        }
      });

      if (paths.includes('/admin/callback.html')) {
        return 'IDP_ADMIN';
      }

      if (paths.includes('/client-admin/callback.html')) {
        return 'CLIENT_ADMIN';
      }

      return null;
    }

  async findByClientId(
    clientId: string,
  ): Promise<Client | null> {
    return await this.clients.findByClientId(
      clientId,
    );
  }

  async save(client: Client): Promise<Client> {
    return this.clients.save(client);
  }

  async deleteByClientId(clientId: string): Promise<void> {
    await this.clients.deleteByClientId(clientId);
  }
  
  async updateClient(
    clientId: string,
    input: UpdateClientInput & ClientStatusUpdate,
  ): Promise<Client> {
    const client = await this.findByClientId(clientId);

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    if (input.name !== undefined) client.name = input.name;
    if (input.redirectUris !== undefined) client.redirectUris = input.redirectUris;
    if (input.postLogoutRedirectUris !== undefined) client.postLogoutRedirectUris = input.postLogoutRedirectUris;
    if (input.allowedScopes !== undefined) client.allowedScopes = input.allowedScopes;
    if (input.grantTypes !== undefined) client.grantTypes = input.grantTypes;
    if (input.responseTypes !== undefined) client.responseTypes = input.responseTypes;
    if (input.tokenEndpointAuthMethod !== undefined) client.tokenEndpointAuthMethod = input.tokenEndpointAuthMethod;
    if (input.interactionMode !== undefined) client.interactionMode = input.interactionMode;
    if (input.interactionLoginUrl !== undefined) client.interactionLoginUrl = input.interactionLoginUrl || null;
    if (input.interactionConsentUrl !== undefined) client.interactionConsentUrl = input.interactionConsentUrl || null;
    if (input.portalType !== undefined) client.portalType = input.portalType;
  if (input.enabled !== undefined) client.enabled = input.enabled;

    return this.save(client);
  }
  constructor(
    private readonly clients: ClientRepository,
  ) { }

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
    client.portalType = input.portalType ?? ClientPortal.NONE;

    client.name = input.name;

    client.redirectUris =
      input.redirectUris;

    /*
     * OIDC RP-Initiated Logout
     */
    client.postLogoutRedirectUris =
      input.postLogoutRedirectUris ?? [];

    client.allowedScopes =
      input.allowedScopes;

    client.grantTypes =
      input.grantTypes;

    client.responseTypes =
      input.responseTypes;

    client.tokenEndpointAuthMethod =
      input.tokenEndpointAuthMethod;

    client.interactionMode =
      input.interactionMode ?? InteractionMode.HOSTED;

    client.interactionLoginUrl =
      input.interactionLoginUrl ?? null;

    client.interactionConsentUrl =
      input.interactionConsentUrl ?? null;

    client.enabled = true;

    const saved =
      await this.save(client);

    return {
      client: saved,
      clientSecret,
    };
  }
}