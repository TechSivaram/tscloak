import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { FederationProvider } from './federation-provider.entity';

@Entity('federation_transactions')
export class FederationTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    unique: true,
  })
  state: string;

  @Column({
    type: 'varchar',
  })
  nonce: string;

  @Column({
    type: 'text',
  })
  codeVerifier: string;

  @Column({
    type: 'uuid',
    nullable: false,
  })
  providerId: string;

  @ManyToOne(() => FederationProvider, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'providerId',
    referencedColumnName: 'id',
  })
  provider: FederationProvider;

  @Column({
    type: 'datetime',
    nullable: false,
  })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({
    // Client IDs are public OAuth identifiers, not the client's DB UUID.
    type: 'varchar',
    nullable: false,
  })
  clientId: string;

  @Column({
    type: 'varchar',
    nullable: false,
  })
  interactionUid: string;
}
