import { Module } from '@nestjs/common';

import { EnvironmentSigningKeyProvider } from './providers/environment-signing-key/environment-signing-key.provider';
import { SIGNING_KEY_PROVIDER } from './providers/signing-key.provider';
import { SigningKeyService } from './services/signing-key/signing-key.service';

@Module({
  providers: [
    EnvironmentSigningKeyProvider,

    {
      provide: SIGNING_KEY_PROVIDER,
      useExisting: EnvironmentSigningKeyProvider,
    },

    SigningKeyService,
  ],

  exports: [
    SigningKeyService,
  ],
})
export class SigningKeysModule {}