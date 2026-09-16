import { Role } from '../entities/role.entity';

export abstract class RoleRepository {
  abstract findByName(
    name: string,
  ): Promise<Role | null>;

  abstract save(
    role: Role,
  ): Promise<Role>;

  abstract findAll(): Promise<Role[]>;
}