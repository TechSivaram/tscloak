import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ClientsService } from '../clients/clients.service';
import { IdentityService } from '../identity/identity.service';

import { CreateFederationProviderDto } from './dto/create-federation-provider.dto';
import { UpdateClientFederationProviderDto } from './dto/update-client-federation-provider.dto';
import { UpdateFederationProviderDto } from './dto/update-federation-provider.dto';
import { ClientFederationProvider } from './entities/client-federation-provider.entity';
import { FederatedIdentity } from './entities/federated-identity.entity';
import { FederationProvider } from './entities/federation-provider.entity';
import { FederationTransaction } from './entities/federation-transaction.entity';
import { OidcFederationService } from './providers/oidc-federation/oidc-federation.service';

@Injectable()
export class FederationService {
  constructor(
    @InjectRepository(FederationProvider)
    private readonly providerRepository: Repository<FederationProvider>,

    @InjectRepository(FederatedIdentity)
    private readonly identityRepository: Repository<FederatedIdentity>,

    @InjectRepository(FederationTransaction)
    private readonly transactionRepository: Repository<FederationTransaction>,

    @InjectRepository(ClientFederationProvider)
    private readonly clientProviderRepository: Repository<ClientFederationProvider>,

    private readonly oidcFederationService: OidcFederationService,

    private readonly clientsService: ClientsService,

    private readonly identityService: IdentityService,
  ) {}

  async createProvider(
    dto: CreateFederationProviderDto,
  ): Promise<FederationProvider> {
    const metadata = await this.oidcFederationService.discover(dto.issuer);

    if (metadata.issuer !== dto.issuer) {
      throw new BadRequestException(
        'OIDC issuer does not match discovered issuer',
      );
    }

    const provider = this.providerRepository.create({
      name: dto.name,
      type: dto.type,
      issuer: dto.issuer,
      clientId: dto.clientId,
      clientSecret: dto.clientSecret,
      scopes: dto.scopes ?? ['openid', 'profile', 'email'],
      enabled: dto.enabled ?? true,
    });

    return this.providerRepository.save(provider);
  }

  async findAllProviders(): Promise<FederationProvider[]> {
    return this.providerRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findEnabledProviderOptions(
    clientId: string,
  ): Promise<Pick<FederationProvider, 'id' | 'name'>[]> {
    const client = await this.clientsService.findByClientId(clientId);
    if (!client || !client.enabled) return [];

    const [providers, overrides] = await Promise.all([
      this.providerRepository.find({
        select: {
          id: true,
          name: true,
        },
        where: {
          enabled: true,
        },
        order: {
          name: 'ASC',
        },
      }),
      this.clientProviderRepository.find({
        where: { clientId: client.id },
        select: { providerId: true, enabled: true },
      }),
    ]);
    const enabledOverrides = new Map(
      overrides.map((override) => [override.providerId, override.enabled]),
    );

    return providers.filter(
      (provider) => enabledOverrides.get(provider.id) !== false,
    );
  }

  async findClientProviderOptions(clientId: string): Promise<
    Array<
      Pick<FederationProvider, 'id' | 'name' | 'type'> & {
        enabled: boolean;
        availableGlobally: boolean;
      }
    >
  > {
    const client = await this.clientsService.findByClientId(clientId);
    if (!client || !client.enabled) {
      throw new NotFoundException('Client not found or disabled');
    }

    const [providers, overrides] = await Promise.all([
      this.providerRepository.find({
        select: { id: true, name: true, type: true, enabled: true },
        order: { name: 'ASC' },
      }),
      this.clientProviderRepository.find({
        where: { clientId: client.id },
        select: { providerId: true, enabled: true },
      }),
    ]);
    const enabledOverrides = new Map(
      overrides.map((override) => [override.providerId, override.enabled]),
    );

    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      availableGlobally: provider.enabled,
      enabled: provider.enabled && enabledOverrides.get(provider.id) !== false,
    }));
  }

  async setClientProviderEnabled(
    clientId: string,
    providerId: string,
    input: UpdateClientFederationProviderDto,
  ): Promise<void> {
    const client = await this.clientsService.findByClientId(clientId);
    if (!client || !client.enabled) {
      throw new NotFoundException('Client not found or disabled');
    }

    const provider = await this.findProviderById(providerId);
    if (!provider) {
      throw new NotFoundException('Federation provider not found');
    }
    if (input.enabled && !provider.enabled) {
      throw new BadRequestException('Federation provider is disabled globally');
    }

    let override = await this.clientProviderRepository.findOne({
      where: { clientId: client.id, providerId },
    });
    if (!override) {
      override = this.clientProviderRepository.create({
        clientId: client.id,
        providerId,
        enabled: input.enabled,
      });
    } else {
      override.enabled = input.enabled;
    }
    await this.clientProviderRepository.save(override);
  }

  async isProviderEnabledForClient(
    providerId: string,
    clientId: string,
  ): Promise<boolean> {
    const client = await this.clientsService.findByClientId(clientId);
    if (!client || !client.enabled) return false;

    const provider = await this.findProviderById(providerId);
    if (!provider?.enabled) return false;

    const override = await this.clientProviderRepository.findOne({
      where: { clientId: client.id, providerId },
      select: { enabled: true },
    });
    return override?.enabled !== false;
  }

  async findProviderById(id: string): Promise<FederationProvider | null> {
    return this.providerRepository.findOne({
      where: {
        id,
      },
    });
  }

  async updateProvider(
    id: string,
    dto: UpdateFederationProviderDto,
  ): Promise<FederationProvider> {
    const provider = await this.findProviderById(id);

    if (!provider) {
      throw new NotFoundException('Federation provider not found');
    }

    Object.assign(provider, dto);

    return this.providerRepository.save(provider);
  }

  async deleteProvider(id: string): Promise<void> {
    const provider = await this.findProviderById(id);

    if (!provider) {
      throw new NotFoundException('Federation provider not found');
    }

    await this.providerRepository.remove(provider);
  }

  async createTransaction(
    providerId: string,
    clientId: string,
    interactionUid: string,
    state: string,
    nonce: string,
    codeVerifier: string,
  ): Promise<FederationTransaction> {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const client = await this.clientsService.findByClientId(clientId);

    if (!client || !client.enabled) {
      throw new NotFoundException('Client not found or disabled');
    }

    const transaction = this.transactionRepository.create({
      providerId,
      clientId,
      interactionUid,
      state,
      nonce,
      codeVerifier,
      expiresAt,
    });

    return this.transactionRepository.save(transaction);
  }

  async consumeTransaction(state: string): Promise<FederationTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        state,
      },
      relations: {
        provider: true,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Federation transaction not found');
    }

    if (transaction.expiresAt.getTime() < Date.now()) {
      await this.transactionRepository.remove(transaction);

      throw new BadRequestException('Federation transaction has expired');
    }

    await this.transactionRepository.remove(transaction);

    return transaction;
  }

  async buildAuthorizationUrl(
    provider: FederationProvider,
    state: string,
    nonce: string,
    codeChallenge: string,
  ): Promise<string> {
    return this.oidcFederationService.buildAuthorizationUrl(
      provider.issuer,
      provider.clientId,
      provider.scopes,
      state,
      nonce,
      codeChallenge,
    );
  }

  async exchangeCode(
    provider: FederationProvider,
    code: string,
    codeVerifier: string,
  ): Promise<Record<string, unknown>> {
    return this.oidcFederationService.exchangeCode(
      provider.issuer,
      provider.clientId,
      provider.clientSecret,
      code,
      codeVerifier,
    );
  }

  async verifyIdToken(
    provider: FederationProvider,
    idToken: string,
    nonce: string,
  ): Promise<Record<string, unknown>> {
    return this.oidcFederationService.verifyIdToken(
      provider.issuer,
      provider.clientId,
      idToken,
      nonce,
    );
  }

  async findFederatedIdentity(
    providerId: string,
    subject: string,
  ): Promise<FederatedIdentity | null> {
    return this.identityRepository.findOne({
      where: {
        providerId,
        subject,
      },
      relations: {
        user: true,
      },
    });
  }

  async findOrCreateFederatedIdentity(
    providerId: string,
    clientId: string,
    claims: Record<string, unknown>,
  ): Promise<FederatedIdentity> {
    const subject = claims['sub'];

    if (typeof subject !== 'string' || subject.length === 0) {
      throw new BadRequestException(
        'Federation ID token does not contain a valid subject',
      );
    }

    const existing = await this.findFederatedIdentity(providerId, subject);

    if (existing) {
      return existing;
    }

    const email =
      typeof claims['email'] === 'string' && claims['email'].trim()
        ? claims['email'].trim()
        : null;
    const user = await this.identityService.createFederatedUser(
      clientId,
      email,
    );

    return this.createFederatedIdentity(
      providerId,
      user.id,
      subject,
      email,
      claims,
    );
  }

  async createFederatedIdentity(
    providerId: string,
    userId: string,
    subject: string,
    email: string | null,
    profile: Record<string, unknown> | null,
  ): Promise<FederatedIdentity> {
    const identity = this.identityRepository.create({
      providerId,
      userId,
      subject,
      email,
      profile,
    });

    return this.identityRepository.save(identity);
  }
}
