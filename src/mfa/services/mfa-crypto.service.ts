import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

@Injectable()
export class MfaCryptoService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const encodedKey = this.configService.get<string>('MFA_ENCRYPTION_KEY');

    if (!encodedKey) {
      throw new InternalServerErrorException(
        'MFA_ENCRYPTION_KEY is not configured',
      );
    }

    let key: Buffer;

    try {
      key = Buffer.from(encodedKey, 'base64');
    } catch {
      throw new InternalServerErrorException(
        'MFA_ENCRYPTION_KEY is not valid base64',
      );
    }

    if (key.length !== KEY_LENGTH) {
      throw new InternalServerErrorException(
        'MFA_ENCRYPTION_KEY must decode to exactly 32 bytes',
      );
    }

    this.key = key;
  }

  encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  decrypt(value: string): string {
    let payload: Buffer;

    try {
      payload = Buffer.from(value, 'base64');
    } catch {
      throw new BadRequestException('Invalid encrypted MFA secret');
    }

    const minimumLength = IV_LENGTH + AUTH_TAG_LENGTH;

    if (payload.length <= minimumLength) {
      throw new BadRequestException('Invalid encrypted MFA secret');
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv);

      decipher.setAuthTag(authTag);

      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException('Invalid encrypted MFA secret');
    }
  }
}
