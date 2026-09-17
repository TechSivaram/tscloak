import { Role } from '../entities/role.entity';

export abstract class RoleRepository {
  abstract count(): Promise<number>;

  abstract findByName(
    name: string,
  ): Promise<Role | null>;

  abstract findById(id: string): Promise<Role | null>;

  abstract save(
    role: Role,
  ): Promise<Role>;

  abstract findAll(): Promise<Role[]>;
}