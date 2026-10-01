import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type OidcMfaAuthMethod = 'pwd' | 'federated';

@Entity('oidc_mfa_challenges')
export class OidcMfaChallenge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  interactionUid: string;

  @Column()
  userId: string;

  @Column({ type: 'varchar', default: 'pwd' })
  authMethod: OidcMfaAuthMethod;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
