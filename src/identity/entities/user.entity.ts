import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column()
  passwordHash: string;

  @Column({ default: true })
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

  @ManyToOne(() => Client)
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client: Client;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'user_roles',
  })
  roles: Role[];
}
