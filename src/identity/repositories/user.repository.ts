import { User } from '../entities/user.entity';

export abstract class UserRepository {
  abstract count(): Promise<number>;

  abstract findAll(clientId?: string): Promise<User[]>;

  abstract findById(id: string, clientId: string): Promise<User | null>;

  abstract findByIdForOidc(id: string): Promise<User | null>;

  abstract findByUsername(
    username: string,
    clientId: string,
  ): Promise<User | null>;

  abstract findByEmail(email: string, clientId: string): Promise<User | null>;

  abstract save(user: User): Promise<User>;
}
