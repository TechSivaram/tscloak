import { Session } from '../entities/session.entity';

export abstract class SessionRepository {
  abstract create(
    session: Session,
  ): Promise<Session>;

  abstract findById(
    id: string,
  ): Promise<Session | null>;

  abstract save(
    session: Session,
  ): Promise<Session>;
}