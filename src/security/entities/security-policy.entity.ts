import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('security_policies')
export class SecurityPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // =========================
  // Token Policy
  // =========================

  @Column({
    type: 'integer',
    default: 900,
  })
  accessTokenTtl: number;

  @Column({
    type: 'integer',
    default: 900,
  })
  idTokenTtl: number;

  @Column({
    type: 'integer',
    default: 300,
  })
  authorizationCodeTtl: number;

  @Column({
    type: 'integer',
    default: 60 * 60 * 24 * 30,
  })
  refreshTokenTtl: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  refreshTokenRotationEnabled: boolean;

  @Column({
    type: 'boolean',
    default: true,
  })
  refreshTokenReuseDetectionEnabled: boolean;

  // =========================
  // Session Policy
  // =========================

  @Column({
    type: 'integer',
    default: 60 * 60 * 24 * 7,
  })
  sessionTtl: number;

  @Column({
    type: 'integer',
    default: 600,
  })
  interactionTtl: number;

  // =========================
  // Audit
  // =========================

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}