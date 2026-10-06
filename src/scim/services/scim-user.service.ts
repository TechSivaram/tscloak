import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { IdentityService } from '../../identity/identity.service';
import { User } from '../../identity/entities/user.entity';
import { UserRepository } from '../../identity/repositories/user.repository';

export interface ScimUserPatchOperation { op: 'add' | 'replace' | 'remove'; path?: string; value?: unknown; }
export interface ScimUserInput {
  userName: string;
  name?: { givenName?: string; familyName?: string };
  displayName?: string;
  emails?: Array<{ value?: string; primary?: boolean; type?: string }>;
  active?: boolean;
}

@Injectable()
export class ScimUserService {
  constructor(private readonly identity: IdentityService, private readonly users: UserRepository) {}
  list(clientId: string) { return this.users.findAll(clientId); }
  async get(id: string, clientId: string): Promise<User> {
    const user = await this.users.findByIdForAdministration(id, clientId);
    if (!user) throw new NotFoundException('Resource User not found');
    return user;
  }
  async create(clientId: string, input: ScimUserInput): Promise<User> {
    const userName = input.userName?.trim();
    if (!userName) throw new BadRequestException('userName is required');
    const email = this.getEmail(input) ?? `${userName}@scim.invalid`;
    const user = await this.identity.createUser({ username: userName, email, password: randomBytes(32).toString('base64url'), clientId });
    user.givenName = input.name?.givenName ?? null;
    user.familyName = input.name?.familyName ?? null;
    user.displayName = input.displayName ?? null;
    user.enabled = input.active ?? true;
    return this.users.save(user);
  }
  async update(id: string, clientId: string, input: ScimUserInput): Promise<User> {
    const email = this.getEmail(input);
    return this.identity.updateUser(id, clientId, {
      username: input.userName,
      ...(email ? { email } : {}),
      enabled: input.active ?? true,
      givenName: input.name?.givenName ?? null,
      familyName: input.name?.familyName ?? null,
      displayName: input.displayName ?? null,
    });
  }
  async patch(id: string, clientId: string, operations: ScimUserPatchOperation[]): Promise<User> {
    const user = await this.get(id, clientId);
    let username = user.username, email = user.email, enabled = user.enabled;
    let givenName = user.givenName, familyName = user.familyName, displayName = user.displayName;
    for (const operation of operations) {
      const op = operation.op.toLowerCase();
      const path = operation.path?.toLowerCase();
      if (op === 'remove') {
        if (path === 'name.givenname') givenName = null;
        else if (path === 'name.familyname') familyName = null;
        else if (path === 'displayname') displayName = null;
        else throw new BadRequestException(`Unsupported SCIM remove path: ${operation.path}`);
        continue;
      }
      if (path === 'username') username = this.asString(operation.value, 'userName');
      else if (path === 'displayname') displayName = this.asNullableString(operation.value);
      else if (path === 'name.givenname') givenName = this.asNullableString(operation.value);
      else if (path === 'name.familyname') familyName = this.asNullableString(operation.value);
      else if (path === 'active') enabled = this.asBoolean(operation.value, 'active');
      else if (path === 'emails') email = this.extractPatchEmail(operation.value);
      else if (!path) {
        const value = operation.value as any;
        if (value?.userName !== undefined) username = this.asString(value.userName, 'userName');
        if (value?.active !== undefined) enabled = this.asBoolean(value.active, 'active');
        if (value?.displayName !== undefined) displayName = this.asNullableString(value.displayName);
        if (value?.name?.givenName !== undefined) givenName = this.asNullableString(value.name.givenName);
        if (value?.name?.familyName !== undefined) familyName = this.asNullableString(value.name.familyName);
        if (value?.emails !== undefined) email = this.extractPatchEmail(value.emails);
      } else throw new BadRequestException(`Unsupported SCIM path: ${operation.path}`);
    }
    return this.identity.updateUser(id, clientId, { username, email, enabled, givenName, familyName, displayName });
  }
  async remove(id: string, clientId: string): Promise<void> { await this.identity.updateUser(id, clientId, { enabled: false }); }
  private getEmail(input: ScimUserInput): string | undefined {
    const emails = input.emails ?? [];
    return emails.find((email) => email.primary)?.value ?? emails[0]?.value;
  }
  private extractPatchEmail(value: unknown): string {
    const values = Array.isArray(value) ? value : [value];
    const selected = values.find((entry: any) => entry?.primary) ?? values[0];
    return this.asString(selected?.value, 'email');
  }
  private asString(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} must be a non-empty string`);
    return value.trim();
  }
  private asNullableString(value: unknown): string | null { return value === null || value === undefined || value === '' ? null : this.asString(value, 'value'); }
  private asBoolean(value: unknown, field: string): boolean {
    if (typeof value !== 'boolean') throw new BadRequestException(`${field} must be a boolean`);
    return value;
  }
}
