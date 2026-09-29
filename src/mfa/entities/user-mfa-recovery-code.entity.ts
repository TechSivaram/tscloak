import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { UserMfa } from './user-mfa.entity';

@Entity('user_mfa_recovery_codes')
export class UserMfaRecoveryCode {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => UserMfa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userMfaId' })
  userMfa: UserMfa;

  @Column()
  userMfaId: number;

  @Column({ type: 'varchar', length: 255 })
  codeHash: string;

  @Column({ type: 'datetime', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
