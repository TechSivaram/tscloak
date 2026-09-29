import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';

@Injectable()
export class MfaTotpService {
  private readonly issuer = 'TSCloak';

  generateSecret(): string {
    return generateSecret();
  }

  generateOtpAuthUri(accountName: string, secret: string): string {
    return generateURI({
      issuer: this.issuer,
      label: accountName,
      secret,
    });
  }

  async verifyCode(secret: string, token: string): Promise<boolean> {
    const result = await verify({
      secret,
      token,
    });

    return result.valid;
  }
}
