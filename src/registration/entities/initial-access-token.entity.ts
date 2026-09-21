import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('initial_access_tokens')
export class InitialAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  /**
   * Hash of the actual Initial Access Token.
   * Plaintext token is never stored.
   */
  @Column({
    name: 'token_hash',
    unique: true,
    length: 64,
  })
  tokenHash: string;

  @Column({
    name: 'max_registrations',
    type: 'integer',
    default: 1,
  })
  maxRegistrations: number;

  @Column({
    name: 'registrations_used',
    type: 'integer',
    default: 0,
  })
  registrationsUsed: number;

  /**
   * NULL means no expiration.
   */
  @Column({
    name: 'expires_at',
    type: 'datetime',
    nullable: true,
  })
  expiresAt: Date | null;

  @Column({
    default: false,
  })
  revoked: boolean;

  @CreateDateColumn({
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
  })
  updatedAt: Date;
}
