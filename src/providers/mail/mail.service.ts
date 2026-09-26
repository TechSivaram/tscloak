import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

import { initialAccessTokenTemplate } from './templates/initial-access-token.template';
import { passwordResetTemplate } from './templates/password-reset.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const from = process.env.MAIL_FROM;

    if (!from) {
      throw new Error('MAIL_FROM environment variable is not configured');
    }

    const email = passwordResetTemplate({
      resetUrl,
      expiresInMinutes: 30,
    });

    await this.transporter.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });

    this.logger.log(`Password reset email sent to ${to}`);
  }

  async sendInitialAccessTokenEmail(to: string, token: string): Promise<void> {
    const from = process.env.MAIL_FROM;

    if (!from) {
      throw new Error('MAIL_FROM environment variable is not configured');
    }

    const email = initialAccessTokenTemplate({
      token,
    });

    await this.transporter.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      attachments: email.attachments,
    });

    this.logger.log(`Initial access token email sent to ${to}`);
  }
}
