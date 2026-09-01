/**
 * RSA private JSON Web Key.
 *
 * This key contains both public and private key material.
 * It must NEVER be exposed through an API.
 */
export interface RsaPrivateJwk {
    /**
     * Key type.
     */
    kty: 'RSA';

    /**
     * Unique key identifier.
     */
    kid: string;

    /**
     * Intended key usage.
     */
    use?: 'sig';

    /**
     * Signing algorithm.
     */
    alg?: 'RS256';

    /**
     * RSA public modulus.
     */
    n: string;

    /**
     * RSA public exponent.
     */
    e: string;

    /**
     * RSA private exponent.
     */
    d: string;

    /**
     * RSA private prime factors.
     */
    p?: string;
    q?: string;

    /**
     * RSA CRT parameters.
     */
    dp?: string;
    dq?: string;
    qi?: string;

    [key: string]: unknown;
}

/**
 * Private JSON Web Key Set.
 *
 * Used internally for token signing.
 */
export interface PrivateJwks {
    keys: RsaPrivateJwk[];
}

/**
 * RSA public JSON Web Key.
 *
 * Safe to expose through the JWKS endpoint.
 */
export interface RsaPublicJwk {
    kty: 'RSA';
    kid: string;
    use?: 'sig';
    alg?: 'RS256';

    n: string;
    e: string;
}

/**
 * Public JSON Web Key Set.
 */
export interface PublicJwks {
    keys: RsaPublicJwk[];
}