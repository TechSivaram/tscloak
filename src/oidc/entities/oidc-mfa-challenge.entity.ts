import {
    Column,
    CreateDateColumn,
    Entity,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('oidc_mfa_challenges')
export class OidcMfaChallenge {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  interactionUid: string;

  @Column()
  userId: string;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
