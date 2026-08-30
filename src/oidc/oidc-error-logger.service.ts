import { Injectable, OnModuleInit } from '@nestjs/common';
import { OidcService } from 'nest-oidc-provider';

@Injectable()
export class OidcErrorLoggerService implements OnModuleInit {
  constructor(private readonly oidcService: OidcService) {}

  onModuleInit() {
    this.oidcService.provider.on('server_error', (ctx, err) => {
      console.error('\n========== OIDC SERVER ERROR ==========');
      console.error('Path:', ctx.path);
      console.error('Method:', ctx.method);
      console.error('Error:', err);
      console.error('Stack:', err?.stack);
      console.error('========================================\n');
    });
  }
}