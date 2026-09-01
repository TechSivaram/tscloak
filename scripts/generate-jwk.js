const crypto = require('crypto');

function base64UrlEncode(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function generateJwk() {
    console.log('Generating RSA 2048-bit signing key...\n');

    const { privateKey } = crypto.generateKeyPairSync(
        'rsa',
        {
            modulusLength: 2048,

            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },

            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
            },
        },
    );

    // Convert PEM private key into a JWK
    const privateKeyObject =
        crypto.createPrivateKey(privateKey);

    const jwk =
        privateKeyObject.export({
            format: 'jwk',
        });

    jwk.kid =
        `tscloak-key-${new Date()
            .toISOString()
            .slice(0, 10)}`;

    jwk.use = 'sig';
    jwk.alg = 'RS256';

    const jwks = {
        keys: [jwk],
    };

    console.log('Generated Private JWKS:\n');

    console.log(
        JSON.stringify(
            jwks,
            null,
            2,
        ),
    );

    console.log('\n-----------------------------------\n');

    console.log('.env format:\n');

    console.log(
        `OIDC_JWKS='${JSON.stringify(jwks)}'`,
    );

    console.log(
        '\nIMPORTANT: Keep this private key secure.',
    );
}

try {
    generateJwk();
} catch (error) {
    console.error(
        'Failed to generate JWK:',
        error,
    );

    process.exit(1);
}