import { Request } from 'express';

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

export interface AuthenticatedUser {
  id: string;
  clientId?: string;
  roles: string[];
  scope?: string;
  accessToken: string;
}
