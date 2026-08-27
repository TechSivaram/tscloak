import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    unique: true,
  })
  clientId: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  clientSecret: string | null;

  @Column()
  name: string;

  @Column('simple-json')
  redirectUris: string[];

  @Column('simple-json')
  allowedScopes: string[];

  @Column('simple-json')
  grantTypes: string[];

  @Column('simple-json')
  responseTypes: string[];

  @Column({
    default: 'none',
  })
  tokenEndpointAuthMethod: string;

  @Column({
    default: true,
  })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}