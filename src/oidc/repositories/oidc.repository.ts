import { DeepPartial } from 'typeorm';

import { Oidc } from '../entities/oidc.entity';

export abstract class OidcRepository {
  abstract find(
    model: string,
    id: string,
  ): Promise<Oidc | null>;

  abstract findByUid(
    model: string,
    uid: string,
  ): Promise<Oidc | null>;

  abstract findByUserCode(
    model: string,
    userCode: string,
  ): Promise<Oidc | null>;

  abstract save(
    oidc: DeepPartial<Oidc>,
  ): Promise<Oidc>;

  abstract delete(
    model: string,
    id: string,
  ): Promise<void>;

  abstract findByGrantId(
    grantId: string,
  ): Promise<Oidc[]>;
}