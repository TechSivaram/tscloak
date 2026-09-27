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

import { User } from '../../identity/entities/user.entity';
import { FederationProvider } from './federation-provider.entity';

@Entity('federated_identities')
@Unique('UQ_federated_identity_provider_subject', ['providerId', 'subject'])
export class FederatedIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
    nullable: false,
  })
  providerId: string;

  @ManyToOne(
    () => FederationProvider,
    (provider) => provider.federatedIdentities,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'providerId',
    referencedColumnName: 'id',
  })
  provider: FederationProvider;

  @Column({
    type: 'uuid',
    nullable: false,
  })
  userId: string;

  @ManyToOne(() => User, (user) => user.federatedIdentities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'userId',
    referencedColumnName: 'id',
  })
  user: User;

  /**
   * Stable subject identifier returned by the external identity provider.
   */
  @Column({
    type: 'varchar',
  })
  subject: string;

  /**
   * Email returned by the external identity provider.
   * This is informational and must not be used as the
   * primary identity key.
   */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  email: string | null;

  /**
   * Optional provider profile data.
   */
  @Column({
    type: 'simple-json',
    nullable: true,
  })
  profile: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
