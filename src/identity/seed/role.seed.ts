import { DataSource } from 'typeorm';
import { Role } from '../entities/role.entity';

export async function seedRoles(
  dataSource: DataSource,
): Promise<void> {
  const roleRepository = dataSource.getRepository(Role);

  const roles = [
    {
      name: 'IDP_ADMIN',
      description: 'TSCloak identity provider administrator',
    },
    {
      name: 'CLIENT_ADMIN',
      description: 'Administrator for a client',
    },
    {
      name: 'USER',
      description: 'Regular application user',
    },
  ];

  for (const roleData of roles) {
    const existingRole = await roleRepository.findOne({
      where: {
        name: roleData.name,
      },
    });

    if (!existingRole) {
      await roleRepository.save(
        roleRepository.create(roleData),
      );
    }
  }
}