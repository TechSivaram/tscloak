import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity';

export enum MfaMethod {
  TOTP = 'totp',
}

@Entity('user_mfa')
export class UserMfa {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ unique: true })
  userId: string;

  @Column({ default: false })
  enabled: boolean;

  @Column({
    type: 'varchar',
    default: MfaMethod.TOTP,
  })
  method: MfaMethod;

  @Column({ type: 'text', nullable: true })
  encryptedSecret: string | null;

  @Column({ type: 'datetime', nullable: true })
  enrolledAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
