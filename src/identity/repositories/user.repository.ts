import { User } from '../entities/user.entity';

export abstract class UserRepository {
  abstract findById(id: string,
    client_id: any,): Promise<User | null>;

  abstract findByUsername(
    username: string,
    client_id: any,
  ): Promise<User | null>;

  abstract findByEmail(
    email: string,
    client_id: any,
  ): Promise<User | null>;

  abstract save(user: User): Promise<User>;
}