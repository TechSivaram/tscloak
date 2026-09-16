import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { ClientRepository } from './repositories/client.repository';

describe('ClientsService', () => {
  let service: ClientsService;
  let clients: {
    findByClientId: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    clients = {
      findByClientId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async client => ({
        ...client,
        id: 'client-id',
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        {
          provide: ClientRepository,
          useValue: clients,
        },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('persists post-logout redirect URIs', async () => {
    const postLogoutRedirectUris = [
      'https://client.example.com/logout/callback',
    ];

    await service.createClient({
      name: 'Example Client',
      redirectUris: [
        'https://client.example.com/callback',
      ],
      postLogoutRedirectUris,
      allowedScopes: ['openid'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
    });

    expect(clients.save).toHaveBeenCalledWith(
      expect.objectContaining({
        postLogoutRedirectUris,
      }),
    );
  });

  it('defaults post-logout redirect URIs to an empty list', async () => {
    await service.createClient({
      name: 'Example Client',
      redirectUris: [
        'https://client.example.com/callback',
      ],
      allowedScopes: ['openid'],
      grantTypes: ['authorization_code'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
    });

    expect(clients.save).toHaveBeenCalledWith(
      expect.objectContaining({
        postLogoutRedirectUris: [],
      }),
    );
  });
});
