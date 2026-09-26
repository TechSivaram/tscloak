import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface PasswordResetTemplateData {
  resetUrl: string;
  expiresInMinutes: number;
}

export interface MailTemplate {
  subject: string;
  html: string;
  text: string;
  attachments: Array<{
    filename: string;
    path: string;
    cid: string;
  }>;
}

export function passwordResetTemplate(
  data: PasswordResetTemplateData,
): MailTemplate {
  const templatePath = join(__dirname, 'password-reset.html');

  const logoPath = join(__dirname, '../assets/tscloak-logo.png');

  const html = readFileSync(templatePath, 'utf8')
    .replaceAll('{{RESET_URL}}', data.resetUrl)
    .replaceAll('{{EXPIRY_MINUTES}}', String(data.expiresInMinutes));

  const text = [
    'You requested a password reset for your TSCloak account.',
    '',
    `Reset your password using this link:`,
    data.resetUrl,
    '',
    `This link will expire in ${data.expiresInMinutes} minutes.`,
    '',
    'If you did not request a password reset, you can safely ignore this email.',
  ].join('\n');

  return {
    subject: 'Reset your TSCloak password',
    html,
    text,
    attachments: [
      {
        filename: 'tscloak-logo.png',
        path: logoPath,
        cid: 'tscloak-logo',
      },
    ],
  };
}
