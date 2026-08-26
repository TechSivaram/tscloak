import { Injectable } from '@nestjs/common';

import { Session } from './entities/session.entity';
import { SessionRepository } from './repositories/session.repository';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionRepository,
  ) {}

  async createSession(
    userId: string,
    lifetimeSeconds = 3600,
  ): Promise<Session> {
    const now = new Date();

    const expiresAt = new Date(
      now.getTime() +
        lifetimeSeconds * 1000,
    );

    const session = new Session();

    /*
     * We don't actually need to manually assign
     * the UUID because TypeORM generates it.
     */

    session.userId = userId;
    session.expiresAt = expiresAt;
    session.lastAccessedAt = now;
    session.revokedAt = null;

    return this.sessions.create(session);
  }

  async getValidSession(
    sessionId: string,
  ): Promise<Session | null> {
    const session =
      await this.sessions.findById(sessionId);

    if (!session) {
      return null;
    }

    if (session.revokedAt) {
      return null;
    }

    if (
      session.expiresAt.getTime() <=
      Date.now()
    ) {
      return null;
    }

    session.lastAccessedAt = new Date();

    await this.sessions.save(session);

    return session;
  }

  async revokeSession(
    sessionId: string,
  ): Promise<void> {
    const session =
      await this.sessions.findById(sessionId);

    if (!session) {
      return;
    }

    session.revokedAt = new Date();

    await this.sessions.save(session);
  }
}