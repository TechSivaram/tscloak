import { Client } from '../entities/client.entity';

export abstract class ClientRepository {
  abstract deleteByClientId(clientId: string): Promise<void>;
  
  abstract findByClientId(
    clientId: string,
  ): Promise<Client | null>;

  abstract save(
    client: Client,
  ): Promise<Client>;
}