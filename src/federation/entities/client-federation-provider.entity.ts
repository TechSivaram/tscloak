import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { Client } from '../../clients/entities/client.entity';
import { FederationProvider } from './federation-provider.entity';

@Entity('client_federation_providers')
@Unique('UQ_client_federation_provider', ['clientId', 'providerId'])
export class ClientFederationProvider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId', referencedColumnName: 'id' })
  client: Client;

  @Column({ type: 'uuid' })
  providerId: string;

  @ManyToOne(() => FederationProvider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId', referencedColumnName: 'id' })
  provider: FederationProvider;

  /** An override for this client's availability; absent rows inherit global enabled state. */
  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
