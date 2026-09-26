import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { Client } from '../../clients/entities/client.entity';
import { User } from './user.entity';

@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * SHA-256 hash of the one-time password reset token.
   *
   * The raw reset token must never be stored in the database.
   */
  @Index({ unique: true })
  @Column()
  tokenHash: string;

  /**
   * ID of the user who requested the password reset.
   */
  @Column({
    type: 'uuid',
    nullable: false,
  })
  userId: string;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'userId',
    referencedColumnName: 'id',
  })
  user: User;

  /**
   * ID of the client to which the user belongs.
   */
  @Column({
    type: 'uuid',
    nullable: false,
  })
  clientId: string;

  @ManyToOne(() => Client, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client: Client;

  /**
   * Time at which the reset token expires.
   */
  @Column({
    type: 'datetime',
    nullable: false,
  })
  expiresAt: Date;

  /**
   * Time at which the token was consumed.
   *
   * NULL means the token has not been used.
   */
  @Column({
    type: 'datetime',
    nullable: true,
  })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
