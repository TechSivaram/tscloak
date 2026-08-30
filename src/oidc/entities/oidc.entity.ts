import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('oidc')
@Index(['model', 'id'], { unique: true })
@Index(['model', 'uid'])
@Index(['model', 'userCode'])
@Index(['grantId'])
export class Oidc {
  @PrimaryColumn({
    type: 'text',
  })
  id: string;

  @Column({
    type: 'text',
  })
  model: string;

  @Column({
    type: 'simple-json',
  })
  payload: Record<string, unknown>;

  @Column({
    type: 'datetime',
    nullable: true,
  })
  expiresAt: Date | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  grantId: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  uid: string | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  userCode: string | null;

  @CreateDateColumn({
    type: 'datetime',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'datetime',
  })
  updatedAt: Date;
}