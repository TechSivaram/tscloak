# 🔑 JWKS Generation

This document explains the `generate-jwk.js` utility used by TSCloak to generate the signing-key configuration required by the OIDC provider.

> **Important:** This script generates a **private JWKS**. The generated value contains private RSA key parameters and must be treated as secret configuration.

---

## 🧭 Navigation

- [Overview](#overview)
- [Script Location](#script-location)
- [Prerequisites](#prerequisites)
- [Generate the JWKS](#generate-the-jwks)
- [What the Script Does](#what-the-script-does)
- [Script Output](#script-output)
- [Generated JWKS Structure](#generated-jwks-structure)
- [`.env` Configuration](#env-configuration)
- [Using `OIDC_JWKS`](#using-oidc_jwks)
- [Key Identifier](#key-identifier)
- [What Each Property Means](#what-each-property-means)
- [Security Considerations](#security-considerations)
- [Regenerating the Key](#regenerating-the-key)
- [Troubleshooting](#troubleshooting)

---

<a id="overview"></a>
## 📖 Overview

TSCloak uses RSA signing keys to sign OIDC tokens.

The `generate-jwk.js` script creates the RSA signing key material and converts the generated private key into JWK format. It then wraps that JWK inside a JWKS object and prints the result in a format that can be copied directly into the application's `.env` file.

The script therefore provides a convenient way to initialize `OIDC_JWKS`.

```text
generate-jwk.js
      │
      ▼
Generate RSA 2048-bit key pair
      │
      ▼
Convert private key to JWK
      │
      ▼
Add kid / use / alg
      │
      ▼
Create JWKS { keys: [...] }
      │
      ├──────────────► Print Private JWKS
      │
      └──────────────► Print OIDC_JWKS='...'
```

The script uses Node.js's built-in `crypto` module, so no additional package is required for the generation itself.

---

<a id="script-location"></a>
## 📁 Script Location

The utility is:

```text
generate-jwk.js
```

The script imports Node.js's built-in `crypto` module:

```javascript
const crypto = require('crypto');
```

It does not depend on an external JWK/JWKS package.

---

<a id="prerequisites"></a>
## ✅ Prerequisites

You need:

- Node.js installed
- Access to the TSCloak project
- Permission to create/update the application's environment configuration

No `npm install` step is required specifically for this script because it uses Node.js's built-in `crypto` module.

Verify Node.js:

```bash
node --version
```

---

<a id="generate-the-jwks"></a>
## 🚀 Generate the JWKS

Run the script with Node.js:

```bash
npm run generate:jwk
```

If the script is stored in another directory, provide the appropriate path:

```bash
node path/to/generate-jwk.js
```

The script executes the `generateJwk()` function automatically.

```javascript
try {
  generateJwk();
} catch (error) {
  console.error('Failed to generate JWK:', error);
  process.exit(1);
}
```

---

<a id="what-the-script-does"></a>
## ⚙️ What the Script Does

The script performs the following operations.

### 1. Generates an RSA key pair

The script creates a **2048-bit RSA** key pair.

```javascript
const { privateKey } = crypto.generateKeyPairSync(
  'rsa',
  {
    modulusLength: 2048,
    ...
  },
);
```

The public key is encoded as SPKI PEM and the private key as PKCS#8 PEM.

The script then works with the private key:

```text
RSA Key Pair
    │
    ├── Public Key
    │
    └── Private Key
            │
            ▼
      Convert to JWK
```

The RSA key size is explicitly configured as 2048 bits.

---

### 2. Converts the private key to JWK

The generated private PEM is imported using Node.js:

```javascript
const privateKeyObject =
  crypto.createPrivateKey(privateKey);
```

It is then exported as JWK:

```javascript
const jwk =
  privateKeyObject.export({
    format: 'jwk',
  });
```

Because the JWK is generated from the **private key**, the resulting JWK contains private RSA parameters.

This is why the generated output must be kept secret.

---

### 3. Adds the key identifier

The script assigns a `kid` using the current date:

```javascript
jwk.kid =
  `tscloak-key-${new Date()
    .toISOString()
    .slice(0, 10)}`;
```

The resulting identifier has this format:

```text
tscloak-key-YYYY-MM-DD
```

For example, a key generated on September 26, 2026 would receive:

```text
tscloak-key-2026-09-26
```

The exact value depends on the date when the script is executed.

---

### 4. Sets the key usage

The script sets:

```javascript
jwk.use = 'sig';
```

This indicates that the key is intended for cryptographic signatures.

---

### 5. Sets the signing algorithm

The script sets:

```javascript
jwk.alg = 'RS256';
```

Therefore the generated signing key is configured for:

```text
RS256
```

which is RSA using SHA-256.

---

### 6. Creates the JWKS object

The generated JWK is placed inside a `keys` array:

```javascript
const jwks = {
  keys: [jwk],
};
```

The resulting structure is:

```json
{
  "keys": [
    {
      "...": "private JWK parameters",
      "kid": "tscloak-key-YYYY-MM-DD",
      "use": "sig",
      "alg": "RS256"
    }
  ]
}
```

---

<a id="script-output"></a>
## 🖥️ Script Output

The script prints several pieces of information.

First:

```text
Generating RSA 2048-bit signing key...
```

It then prints:

```text
Generated Private JWKS:
```

followed by the generated JSON.

The script finally prints an `.env` representation:

```text
-----------------------------------

.env format:
```

followed by:

```text
OIDC_JWKS='...'
```

and a security warning:

```text
IMPORTANT: Keep this private key secure.
```

The script explicitly prints the `.env` format using:

```javascript
console.log(
  `OIDC_JWKS='${JSON.stringify(jwks)}'`,
);
```

---

<a id="generated-jwks-structure"></a>
## 🧩 Generated JWKS Structure

The generated object has the following conceptual structure:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "n": "...",
      "e": "...",
      "d": "...",
      "p": "...",
      "q": "...",
      "dp": "...",
      "dq": "...",
      "qi": "...",
      "kid": "tscloak-key-YYYY-MM-DD",
      "use": "sig",
      "alg": "RS256"
    }
  ]
}
```

The RSA private-key parameters are generated by Node.js's JWK export.

The exact values are different every time the script generates a new RSA key.

Do **not** copy the example values above as real key material.

---

<a id="env-configuration"></a>
## 🔧 `.env` Configuration

The script prints the exact environment-variable format expected for the generated value:

```env
OIDC_JWKS='{"keys":[...]}'
```

The actual output contains the complete generated private JWK.

For example:

```env
OIDC_JWKS='{"keys":[{"kty":"RSA","n":"...","e":"AQAB","d":"...","p":"...","q":"...","dp":"...","dq":"...","qi":"...","kid":"tscloak-key-2026-09-26","use":"sig","alg":"RS256"}]}'
```

The values shown with `...` above are intentionally abbreviated. The script prints the complete values.

### Recommended workflow

Run:

```bash
npm run generate:jwk
```

Then copy the line beginning with:

```text
OIDC_JWKS=
```

into the environment configuration used to start TSCloak.

Do not manually reconstruct the JSON if you can avoid it. The script already prints it in the required `.env` format.

---

<a id="using-oidc_jwks"></a>
## 🔐 Using `OIDC_JWKS`

The generated environment variable provides TSCloak with the signing-key material required by the OIDC provider.

The relationship is:

```text
generate-jwk.js
       │
       ▼
OIDC_JWKS
       │
       ▼
TSCloak OIDC Configuration
       │
       ▼
Signing Key
       │
       ▼
Signed JWT
```

The generated value contains the private signing material, so `OIDC_JWKS` should be treated as a secret environment variable.

It should not be committed to Git.

---

<a id="key-identifier"></a>
## 🆔 Key Identifier

The script generates a date-based `kid`:

```text
tscloak-key-YYYY-MM-DD
```

The value is generated from:

```javascript
new Date()
  .toISOString()
  .slice(0, 10)
```

For example:

```text
tscloak-key-2026-09-26
```

The `kid` allows a verifier to identify which public key corresponds to the key used to sign a JWT.

A JWT header may therefore contain:

```json
{
  "alg": "RS256",
  "kid": "tscloak-key-2026-09-26"
}
```

The corresponding public key can then be identified from the provider's JWKS.

---

<a id="what-each-property-means"></a>
## 📋 What Each Property Means

| Property | Value / Source | Purpose |
|---|---|---|
| `kty` | Generated by Node.js | Identifies the key type |
| `n` | Generated by Node.js | RSA modulus |
| `e` | Generated by Node.js | RSA public exponent |
| `d` | Generated by Node.js | RSA private exponent |
| `p` | Generated by Node.js | RSA private parameter |
| `q` | Generated by Node.js | RSA private parameter |
| `dp` | Generated by Node.js | RSA private parameter |
| `dq` | Generated by Node.js | RSA private parameter |
| `qi` | Generated by Node.js | RSA private parameter |
| `kid` | `tscloak-key-YYYY-MM-DD` | Key identifier |
| `use` | `sig` | Signature usage |
| `alg` | `RS256` | Signing algorithm |

The private RSA parameters are the reason the generated JWKS must be protected.

---

<a id="security-considerations"></a>
## 🛡️ Security Considerations

### Never commit `OIDC_JWKS`

The generated value contains the private RSA key.

Do not put it into source control:

```text
❌ Git repository
❌ README
❌ Public configuration
❌ Public JWKS endpoint
❌ Client-side JavaScript
```

Instead use protected environment configuration or an appropriate secret-management mechanism.

### Never share the generated private JWKS

The script deliberately prints:

```text
Generated Private JWKS:
```

and also prints the full value in `.env` format.

That output is sensitive.

If the output is exposed, generate a new key and replace the compromised configuration.

### The public JWKS is different

The public JWKS used by clients for signature verification must contain only public JWK parameters.

The generated `OIDC_JWKS` value from this script is a **private JWKS configuration value**, not something that should simply be published unchanged at `/jwks`.

---

<a id="regenerating-the-key"></a>
## 🔄 Regenerating the Key

Running:

```bash
npm run generate:jwk
```

generates a new RSA key pair.

It also generates a new date-based `kid`.

For example:

```text
Old:
tscloak-key-2026-09-25

New:
tscloak-key-2026-09-26
```

Regenerating the key changes the signing identity.

Previously issued tokens signed by the old key may no longer be verifiable if the old public key is no longer available to consumers.

Therefore:

- For a new/demo installation, generating a fresh key is straightforward.
- For a running environment, key replacement should be treated as a key-rotation operation.
- During controlled rotation, the old public key may need to remain published until tokens signed with it have expired.

---

<a id="troubleshooting"></a>
## 🧪 Troubleshooting

### `node: command not found`

Install Node.js and verify:

```bash
node --version
```

### The script exits with `Failed to generate JWK`

The script catches generation errors and exits with status `1`.

Check the error printed immediately after:

```text
Failed to generate JWK:
```

### `OIDC_JWKS` is difficult to copy

The script intentionally prints a single `.env` line:

```text
OIDC_JWKS='...'
```

Copy that complete line into the environment configuration.

Do not remove the outer single quotes unless the environment-loading mechanism requires a different syntax.

### Token verification fails after regenerating

Check the JWT header:

```json
{
  "kid": "..."
}
```

and compare it with the currently configured signing key and published public JWKS.

If a new private key was generated, consumers must be able to obtain the corresponding public key.

---

## 📌 Complete Setup Example

For a fresh local TSCloak installation:

```bash
# 1. Generate signing-key configuration
node generate-jwk.js

# 2. Copy the generated OIDC_JWKS line
#    into your environment configuration

# 3. Start TSCloak
npm run start:dev
```

Then verify the OIDC Discovery document:

```text
GET /.well-known/openid-configuration
```

and use its `jwks_uri` to locate the public verification keys.

The complete relationship is:

```text
┌─────────────────────────┐
│   generate-jwk.js       │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ RSA 2048-bit Key Pair   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Private JWK + metadata  │
│ kid / use / alg         │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ OIDC_JWKS environment   │
│ variable                │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│       TSCloak           │
│    Token Signing        │
└────────────┬────────────┘
             │
             ▼
        Signed JWT
             │
             ▼
┌─────────────────────────┐
│ Public JWKS / jwks_uri  │
│ for verification        │
└─────────────────────────┘
```

## 🔗 Related Documentation

- [Client Secret Flow](./client-secret-flow.md)
- [Password Reset Flow](./password-reset-flow.md)
- Main [TSCloak README](../README.md)
