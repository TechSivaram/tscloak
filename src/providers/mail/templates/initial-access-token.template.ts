import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface InitialAccessTokenTemplateData {
  token: string;
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

export function initialAccessTokenTemplate(
  data: InitialAccessTokenTemplateData,
): MailTemplate {
  const templatePath = join(__dirname, 'initial-access-token.html');

  const logoPath = join(__dirname, '../assets/tscloak-logo.png');

  const registrationUrl =
    `${process.env.IDP_ADMIN_UI_URL ?? 'http://localhost:3000/idp-admin'}` +
    `/register.html?initial_access_token=${encodeURIComponent(data.token)}`;

  const html = readFileSync(templatePath, 'utf8')
    .replaceAll('{{TOKEN}}', data.token)
    .replaceAll('{{REGISTRATION_URL}}', registrationUrl);

  const text = [
    'TSCloak Initial Access Token',
    '',
    'An initial access token has been created for TSCloak client registration.',
    '',
    'Initial Access Token:',
    data.token,
    '',
    'Register your client using this link:',
    registrationUrl,
    '',
    'This is an automated message from TSCloak. Please do not reply to this email.',
  ].join('\n');

  return {
    subject: 'TSCloak | Initial Access Token',
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
