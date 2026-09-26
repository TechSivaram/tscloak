import { AsyncLocalStorage } from 'async_hooks';

export interface OidcRequestContext {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  oidc?: {
    route?: string;
    params?: Record<string, unknown>;
  };
}

export const oidcRequestContext =
  new AsyncLocalStorage<OidcRequestContext>();
