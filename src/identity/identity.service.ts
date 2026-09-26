import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

import { ClientsService } from '../clients/clients.service';
import { MailService } from '../providers/mail/mail.service';
import { Role } from './entities/role.entity';
import { User } from './entities/user.entity';
import { PasswordResetTokenRepository } from './repositories/password-reset-token.repository';
import { RoleRepository } from './repositories/role.repository';
import { UserRepository } from './repositories/user.repository';

export interface CreateUserInput {
  username: string;
  email: string;
  password: string;
  clientId: string;
}

export interface UpdateUserInput {
  email?: string;
  enabled?: boolean;
}

@Injectable()
export class IdentityService {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly clients: ClientsService,
    private readonly passwordResetTokens: PasswordResetTokenRepository,
    private readonly mailService: MailService,
  ) {}

  async countUsers(): Promise<number> {
    return this.users.count();
  }

  async findUsers(clientId?: string): Promise<User[]> {
    return this.users.findAll(clientId);
  }

  async countRoles(): Promise<number> {
    return this.roles.count();
  }

  async createUser(input: CreateUserInput): Promise<User> {
    return this.createUserWithRoles(input);
  }

  async createClientUser(input: CreateUserInput): Promise<User> {
    return this.createUserWithRoles(input);
  }

  private async createUserWithRoles(
    input: CreateUserInput,
    roleNames: string[] = ['USER'],
  ): Promise<User> {
    if (!input.clientId) {
      throw new BadRequestException('Client ID is required');
    }

    const client = await this.clients.findByClientId(input.clientId);

    if (!client) {
      throw new ConflictException('Client does not exist');
    }

    if (!client.enabled) {
      throw new ConflictException('Client is disabled');
    }

    const clientId = client.id;

    const existingUsername = await this.users.findByUsername(
      input.username,
      clientId,
    );

    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    const existingEmail = await this.users.findByEmail(input.email, clientId);

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(input.password);

    const user = new User();

    user.username = input.username;
    user.email = input.email;
    user.passwordHash = passwordHash;
    user.enabled = true;
    user.clientId = clientId;

    if (roleNames.length > 0) {
      const assignedRoles = await Promise.all(
        roleNames.map((roleName) => this.roles.findByName(roleName)),
      );

      if (assignedRoles.some((role) => !role)) {
        throw new ConflictException('Required user role is not configured');
      }

      user.roles = assignedRoles.filter((role): role is Role => role !== null);
    }

    return this.users.save(user);
  }

  async findByUsername(
    username: string,
    clientId: string,
  ): Promise<User | null> {
    return this.users.findByUsername(username, clientId);
  }

  async findById(id: string, clientId: string): Promise<User | null> {
    return this.users.findById(id, clientId);
  }

  async findByIdForOidc(id: string): Promise<User | null> {
    return this.users.findByIdForOidc(id);
  }

  async updateUser(
    userId: string,
    clientId: string,
    input: UpdateUserInput,
  ): Promise<User> {
    const user = await this.users.findByIdForAdministration(userId, clientId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (input.email !== undefined) {
      user.email = input.email;
    }

    if (input.enabled !== undefined) {
      user.enabled = input.enabled;
    }

    return this.users.save(user);
  }

  async createRole(name: string, description?: string): Promise<Role> {
    const existingRole = await this.roles.findByName(name);

    if (existingRole) {
      throw new ConflictException('Role already exists');
    }

    const role = new Role();

    role.name = name;
    role.description = description;

    return this.roles.save(role);
  }

  async findRoles(): Promise<Role[]> {
    return this.roles.findAll();
  }

  async updateRole(roleId: string, description?: string): Promise<Role> {
    const role = await this.roles.findById(roleId);

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    role.description = description;

    return this.roles.save(role);
  }

  async assignRoles(
    userId: string,
    clientId: string,
    roleNames: string[],
  ): Promise<User> {
    const user = await this.users.findByIdForAdministration(userId, clientId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const roles = await Promise.all(
      roleNames.map((roleName) => this.roles.findByName(roleName)),
    );

    const missingRole = roles.find((role) => !role);

    if (missingRole) {
      throw new NotFoundException('One or more roles were not found');
    }

    user.roles = roles.filter((role): role is Role => role !== null);

    return this.users.save(user);
  }

  async changePassword(
    userId: string,
    clientId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findById(userId, clientId);

    if (!user || !user.enabled) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await argon2.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    user.passwordHash = await argon2.hash(newPassword);

    await this.users.save(user);
  }

  /**
   * Starts the self-service forgot-password flow.
   *
   * The method intentionally does not throw when the user does not
   * exist. The controller always returns the same generic response
   * to prevent account enumeration.
   */
  async requestPasswordReset(clientId: string, email: string): Promise<void> {
    const client = await this.clients.findByClientId(clientId);

    if (!client || !client.enabled) {
      return;
    }

    const user = await this.users.findByEmail(email, clientId);

    if (!user || !user.enabled) {
      return;
    }

    /**
     * Invalidate previously active reset tokens for this user.
     * Only the newest reset request should remain usable.
     */
    await this.passwordResetTokens.invalidateForUser(user.id, clientId);

    /**
     * Generate a cryptographically secure random token.
     *
     * The raw token is returned to the caller of this method
     * internally later for email delivery.
     *
     * It is never stored in the database.
     */
    const rawToken = randomBytes(32).toString('hex');

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    /**
     * Reset token expires after 30 minutes.
     */
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const resetToken = this.passwordResetTokens.create({
      tokenHash,
      userId: user.id,
      clientId: client.id,
      expiresAt,
      usedAt: null,
    });

    await this.passwordResetTokens.save(resetToken);

    /**
     * Email delivery will be connected here.
     *
     * The rawToken must be used to construct the reset URL:
     *
     * https://your-ui.example.com/reset-password?token=<rawToken>
     *
     * Do NOT store rawToken in the database.
     */

    const resetUrl =
      `${process.env.PASSWORD_RESET_UI_URL}` +
      `?token=${encodeURIComponent(rawToken)}`;

    await this.mailService.sendPasswordResetEmail(user.email, resetUrl);
    void rawToken;
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const resetToken =
      await this.passwordResetTokens.findByTokenHash(tokenHash);

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException(
        'Password reset token has already been used',
      );
    }

    if (resetToken.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const user = await this.users.findById(
      resetToken.userId,
      resetToken.client.clientId,
    );

    if (!user || !user.enabled) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await argon2.hash(newPassword);

    user.passwordHash = passwordHash;

    await this.users.save(user);

    resetToken.usedAt = new Date();

    await this.passwordResetTokens.save(resetToken);
  }
}
