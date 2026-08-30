import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { InteractionMode } from '../enums/interaction-mode.enum';

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

  /**
   * Determines where OIDC interactions are rendered.
   *
   * HOSTED   - TSCloak hosted Login and Consent pages
   * EXTERNAL - Client-provided external interaction pages
   */
  @Column({
    type: 'varchar',
    default: InteractionMode.HOSTED,
  })
  interactionMode: InteractionMode;

  /**
   * External login page URL.
   * Required when interactionMode is EXTERNAL.
   */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  interactionLoginUrl: string | null;

  /**
   * External consent page URL.
   * Required when interactionMode is EXTERNAL and
   * a consent interaction is required.
   */
  @Column({
    type: 'varchar',
    nullable: true,
  })
  interactionConsentUrl: string | null;

  @Column({
    default: true,
  })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}