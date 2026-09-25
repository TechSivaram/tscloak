import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../identity/entities/user.entity';
import { InteractionMode } from '../enums/interaction-mode.enum';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    unique: true,
  })
  clientId: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  clientSecret: string | null;

  @Column({
    unique: true,
  })
  name: string;

  @Column('simple-json')
  redirectUris: string[];

  @Column({
    type: 'simple-json',
    default: [],
  })
  postLogoutRedirectUris: string[];

  @Column('simple-json')
  allowedScopes: string[];

  @Column('simple-json')
  grantTypes: string[];

  @Column('simple-json')
  responseTypes: string[];

  @Column({
    default: 'none',
  })
  tokenEndpointAuthMethod: string;

  @Column({
    type: 'varchar',
    default: InteractionMode.HOSTED,
  })
  interactionMode: InteractionMode;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  interactionLoginUrl: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  interactionConsentUrl: string | null;

  @Column({
    default: true,
  })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.client)
  users: User[];
}
