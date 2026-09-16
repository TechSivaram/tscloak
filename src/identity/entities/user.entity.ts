import { Client } from 'src/clients/entities/client.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  clientId: string;


  @ManyToOne(() => Client)
  @JoinColumn({
    name: 'clientId',
    referencedColumnName: 'id',
  })
  client: Client;

  @ManyToMany(() => Role, role => role.users)
  @JoinTable({
    name: 'user_roles',
  })
  roles: Role[];
}