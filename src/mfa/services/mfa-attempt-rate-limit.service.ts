import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface AttemptState {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;
const BLOCK_MS = 60 * 1000;

@Injectable()
export class MfaAttemptRateLimitService {
  private readonly attempts = new Map<string, AttemptState>();

  assertAllowed(key: string): void {
    const now = Date.now();
    const state = this.attempts.get(key);

    if (!state) {
      return;
    }

    if (state.blockedUntil > now) {
      throw new HttpException(
        'Too many MFA verification attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (now - state.firstFailureAt >= WINDOW_MS) {
      this.attempts.delete(key);
    }
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing || now - existing.firstFailureAt >= WINDOW_MS) {
      this.attempts.set(key, {
        failures: 1,
        firstFailureAt: now,
        blockedUntil: 0,
      });

      return;
    }

    existing.failures += 1;

    if (existing.failures >= MAX_FAILURES) {
      existing.blockedUntil = now + BLOCK_MS;
    }

    this.attempts.set(key, existing);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
