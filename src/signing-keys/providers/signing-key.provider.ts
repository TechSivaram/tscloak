import { PrivateJwks } from '../types/signing-key.types';

/**
 * Injection token for the signing key provider.
 */
export const SIGNING_KEY_PROVIDER =
  Symbol('SIGNING_KEY_PROVIDER');

/**
 * Contract for loading private signing keys.
 *
 * Implementations can load keys from different sources:
 *
 * - Environment variables
 * - Files
 * - Kubernetes Secrets
 * - AWS Secrets Manager
 * - Azure Key Vault
 */
export interface SigningKeyProvider {
  getPrivateJwks(): PrivateJwks;
}