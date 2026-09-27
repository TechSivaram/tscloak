import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { FederatedIdentity } from './federated-identity.entity';

@Entity('federation_providers')
export class FederationProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    unique: true,
  })
  name: string;

  @Column({
    type: 'varchar',
  })
  type: string;

  @Column({
    type: 'varchar',
  })
  issuer: string;

  @Column({
    type: 'varchar',
  })
  clientId: string;

  @Column({
    type: 'text',
  })
  clientSecret: string;

  @Column('simple-json')
  scopes: string[];

  @Column({
    default: true,
  })
  enabled: boolean;

  @OneToMany(() => FederatedIdentity, (identity) => identity.provider)
  federatedIdentities: FederatedIdentity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
