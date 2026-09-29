import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OidcMfaChallenge } from '../entities/oidc-mfa-challenge.entity';

const MFA_CHALLENGE_TTL_SECONDS = 300;

@Injectable()
export class OidcMfaChallengeService {
  constructor(
    @InjectRepository(OidcMfaChallenge)
    private readonly repository: Repository<OidcMfaChallenge>,
  ) {}

  async create(interactionUid: string, userId: string): Promise<void> {
    await this.repository.delete({
      interactionUid,
    });

    const expiresAt = new Date(Date.now() + MFA_CHALLENGE_TTL_SECONDS * 1000);

    await this.repository.save(
      this.repository.create({
        interactionUid,
        userId,
        expiresAt,
      }),
    );
  }

  async get(interactionUid: string): Promise<OidcMfaChallenge | null> {
    const challenge = await this.repository.findOne({
      where: {
        interactionUid,
      },
    });

    if (!challenge) {
      return null;
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.repository.delete({
        id: challenge.id,
      });

      return null;
    }

    return challenge;
  }

  async require(interactionUid: string): Promise<OidcMfaChallenge> {
    const challenge = await this.get(interactionUid);

    if (!challenge) {
      throw new UnauthorizedException('MFA challenge is missing or expired');
    }

    return challenge;
  }

  async remove(interactionUid: string): Promise<void> {
    await this.repository.delete({
      interactionUid,
    });
  }
}
