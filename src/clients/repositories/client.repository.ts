import { Client } from '../entities/client.entity';

export abstract class ClientRepository {
  abstract findByClientId(
    clientId: string,
  ): Promise<Client | null>;

  abstract save(
    client: Client,
  ): Promise<Client>;
}