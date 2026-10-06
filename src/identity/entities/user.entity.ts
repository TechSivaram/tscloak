import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { FederatedIdentity } from 'src/federation/entities/federated-identity.entity';
import { Client } from '../../clients/entities/client.entity';
import { Role } from './role.entity';

@Entity('users')
@Unique('UQ_users_username_client', ['username', 'clientId'])
@Unique('UQ_users_email_client', ['email', 'clientId'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column({ type: 'varchar', nullable: true })
  givenName: string | null;

  @Column({ type: 'varchar', nullable: true })
  familyName: string | null;

  @Column({ type: 'varchar', nullable: true })
  displayName: string | null;

  @Column()
  passwordHash: string;

  @Column({
    default: true,
  })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({
    type: 'uuid',
    nullable: false,
  })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.users, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client: Client;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: {
      name: 'usersId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'rolesId',
      referencedColumnName: 'id',
    },
  })
  roles: Role[];

  @OneToMany(() => FederatedIdentity, (identity) => identity.user)
  federatedIdentities: FederatedIdentity[];
}
