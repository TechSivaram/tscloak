<div align="center">

# 🛡️ TSCloak

### A modular OpenID Connect & OAuth 2.0 Authorization Server built with NestJS

[![NestJS](https://img.shields.io/badge/NestJS-10+-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OIDC](https://img.shields.io/badge/OpenID-Connect-F78C40?logo=openid)](https://openid.net/connect/)
[![OAuth 2.0](https://img.shields.io/badge/OAuth-2.0-3C3C3D)](https://oauth.net/2/)
[![TypeORM](https://img.shields.io/badge/TypeORM-ORM-FE0803)](https://typeorm.io/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#license)

**Protocol-driven. Modular. Persistent. Extensible.**

</div>

---

## 📖 Overview

**TSCloak** is a modular OpenID Connect (OIDC) and OAuth 2.0 Authorization Server built with **NestJS** and **TypeScript**.

It uses [`oidc-provider`](https://github.com/panva/node-oidc-provider) for standards-compliant OAuth 2.0 and OpenID Connect protocol handling while keeping application concerns such as identity, client management, persistence, and infrastructure cleanly separated.

The goal is to provide a maintainable architecture for building an authorization server without tightly coupling business logic to protocol or database implementations.

### ✨ Highlights

- 🔐 OAuth 2.0 Authorization Code Flow
- 🪪 OpenID Connect support
- 🔑 PKCE
- 🎫 Access Tokens and ID Tokens
- ♻️ Refresh Tokens with rotation
- 📴 Offline access
- 👤 UserInfo endpoint
- ⚡ Dynamic client resolution
- 📝 Dynamic Client Registration (RFC 7591)
- 💾 Persistent OIDC runtime state
- 🔄 State survives application restarts
- 🧹 Automatic expiration cleanup
- 🚫 Token Revocation Endpoint (RFC 7009)
- 🔍 Token Introspection Endpoint (RFC 7662)
- 🗄️ Repository-based persistence abstraction

---

## 🖥️ Login Experience

TSCloak provides an authentication interaction page for users to securely sign in before authorization is completed.

<div align="center">

![TSCloak Login Screen](docs/images/TSCloak-login.png)

*TSCloak authentication interaction page*

</div>

---

## 🤝 Consent Experience

TSCloak supports a hosted consent page and can also be integrated with a client-provided custom interaction UI.

During authorization, TSCloak evaluates the authenticated user session, the existing Grant, and the requested scopes. A consent interaction is shown when user approval is required.

```mermaid
flowchart TD
    N0["Authorization Request"] --> N1
    N1["Existing Session?"] --> N2
    N2["┴"] --> N3
    N3["No        Yes"] --> N4
    N4["Login UI    Check Grant"] --> N5
    N5["Missing permissions?"] --> N6
    N6["Yes        No"] --> N7
    N7["Consent UI   Continue"] --> N8
    N8["┬"] --> N9
    N9["Authorization Code"]
```

<div align="center">

![TSCloak Login Screen](docs/images/TSCloak-consent.png)

*TSCloak consent interaction page*

</div>

---

### Consent Persistence

When a user approves a client, TSCloak persists an OIDC `Grant` containing the approved scopes. The session is associated with that Grant so subsequent authorization requests can reuse the existing consent.

Example Grant:

```json
{
  "accountId": "USER_ID",
  "clientId": "CLIENT_ID",
  "openid": {
    "scope": "openid profile email"
  }
}
```

### `prompt=consent`

Clients can explicitly force the consent screen by including:

```text
prompt=consent
```

Even when a valid session and existing Grant are present, this requests a new consent interaction.

### Incremental Consent

For normal scopes, when a client requests permissions that have not yet been approved, TSCloak can present the consent interaction again so the user can approve the additional permissions.

For example:

```mermaid
flowchart LR
    A["Existing Grant<br/>openid profile email"] --> B{New scope requested?}
    C["New Request<br/>openid profile email api.read"] --> B
    B -->|api.read missing| D["Show Consent UI"]
```

### `offline_access` and Refresh Tokens

`offline_access` is a special OpenID Connect scope used to request refresh-token capability.

A client requesting refresh tokens should explicitly request user consent:

```text
scope=openid profile email offline_access
&prompt=consent
```

Without explicit consent, the underlying OIDC provider may exclude `offline_access` from the effective authorization scope. As a result, `offline_access` should not be treated as a normal incremental-consent test case.

After consent is granted, the authorization request can proceed with `offline_access`, allowing the token endpoint to issue a refresh token when the client is configured for the `refresh_token` grant.

---

## 🖥️ Interaction UI Customization

TSCloak supports two approaches for handling OIDC interactions:

1. **Hosted Interaction UI** — TSCloak renders the Login and Consent pages.
2. **Custom Interaction UI** — Applications can provide their own Login and/or Consent experience.

This allows TSCloak to work both as a standalone Identity Provider with built-in screens and as a backend authorization server integrated with an organization's existing UI.

### Hosted UI Flow

Hosted UI is the default behavior.

```mermaid
flowchart TD
    A["Client Application"] -->|GET /auth| B["TSCloak Authorization Server"]
    B --> C{Interaction Required?}
    C -->|Login| D["Hosted Login UI"]
    C -->|Consent| E["Hosted Consent UI"]
    D --> F["interactionFinished"]
    E --> F
    F --> G["Authorization Response"]
    G --> H["Client Callback"]
```

### Custom Interaction UI Flow

Organizations may already have their own Login UI, branding, or consent experience. TSCloak allows the interaction experience to be delegated to an external application.

```mermaid
flowchart TD
    A["Client Application"] -->|GET /auth| B["TSCloak Authorization Server"]
    B -->|Interaction Required| C["Create OIDC Interaction"]
    C -->|interaction_uid + prompt| D["Redirect to Custom UI"]
    D --> E["Custom Login / Consent UI"]
    E -->|User completes interaction| F["Submit Interaction Result"]
    F --> G["interactionFinished"]
    G --> H["Authorization Response"]
    H --> I["Client Callback"]
```

### Interaction URL Configuration

The interaction UI can be configured using an external interaction URL.

Conceptually:

```typescript
interactionLoginUrl?: string;
```

Behavior:

| Configuration | Behavior |
|---|---|
| `interactionLoginUrl` not configured | TSCloak uses its built-in Hosted UI |
| `interactionLoginUrl` configured | TSCloak redirects the interaction to the Custom UI |

The Custom UI receives the interaction identifier and prompt information.

Example login redirect:

```text
http://localhost:4200/login?interaction_uid=<uid>&prompt=login
```

Example consent redirect:

```text
http://localhost:4200/login?interaction_uid=<uid>&prompt=consent
```

### `interaction_uid`

The `interaction_uid` identifies the current OIDC interaction.

```mermaid
sequenceDiagram
    participant C as Client Application
    participant T as TSCloak
    participant U as Custom UI

    C->>T: Authorization Request
    T->>T: Create OIDC Interaction
    T-->>U: Redirect with interaction_uid
    U->>U: User Login / Consent
    U->>T: Complete interaction using interaction_uid
    T-->>C: Authorization Response
```

The Custom UI must preserve this value throughout the Login or Consent flow so that the interaction can be completed against the correct authorization request.

### Prompt-Aware Custom UI

The `prompt` parameter allows a single Custom UI application to handle multiple interaction types.

```text
prompt=login
```

The application should render its authentication experience.

```text
prompt=consent
```

The application should render its consent experience.

Example frontend routing logic:

```typescript
const prompt = queryParams.get('prompt');

switch (prompt) {
  case 'login':
    // Render login screen
    break;

  case 'consent':
    // Render consent screen
    break;
}
```

This architecture allows organizations to fully customize branding and user experience while TSCloak continues to own the OAuth 2.0 / OpenID Connect protocol flow, sessions, grants, authorization codes, and tokens.

---

## 🏗️ Architecture

```mermaid
flowchart TD
    N0["Client App"] --> N1
    N1["SPA / Web / API"] --> N2
    N2["┬"] --> N3
    N3["OAuth / OIDC"] --> N4
    N4["TSCloak"] --> N5
    N5["NestJS Host"] --> N6
    N6["┼"] --> N7
    N7["Clients                  Identity                   OIDC"] --> N8
    N8["Module                    Module                   Module"] --> N9
    N9["┬           ┬          ┬"] --> N10
    N10["Repository Abstractions"] --> N11
    N11["TypeORM"] --> N12
    N12["SQLite DB"]
```

---

## 🧩 Technology Stack

| Technology | Purpose |
|---|---|
| **NestJS** | Application framework |
| **TypeScript** | Programming language |
| **oidc-provider** | OAuth 2.0 & OpenID Connect protocol engine |
| **nest-oidc-provider** | NestJS integration |
| **TypeORM** | Persistence abstraction |
| **SQLite** | Current database implementation |
| **better-sqlite3** | SQLite driver |

---

## 📁 Project Structure

```mermaid
flowchart TD
    N0["src/"] --> N1
    N1["clients/"] --> N2
    N2["entities/"] --> N3
    N3["repositories/"] --> N4
    N4["services/"] --> N5
    N5["identity/"] --> N6
    N6["sessions/"] --> N7
    N7["oidc/"] --> N8
    N8["adapters/"] --> N9
    N9["oidc-options.service.ts"] --> N10
    N10["oidc-cleanup.service.ts"] --> N11
    N11["oidc.module.ts"] --> N12
    N12["app.module.ts"] --> N13
    N13["main.ts"]
```

### Module Responsibilities

| Module | Responsibility |
|---|---|
| **Clients** | Client registration and lookup |
| **Identity** | User identity and account claims |
| **Sessions** | Application session management |
| **OIDC** | Protocol configuration and OIDC integration |

---

## 🔐 Authentication Flow

TSCloak currently supports the **Authorization Code Flow with PKCE**.

```mermaid
flowchart TD
    N0["Client App                                         TSCloak"] --> N1
    N1["┬                                  ┬"] --> N2
    N2["1. Authorization Request + PKCE Challenge"] --> N3
    N3[">"] --> N4
    N4["Authenticate"] --> N5
    N5["User"] --> N6
    N6["2. Redirect with Authorization Code"] --> N7
    N7["<"] --> N8
    N8["3. Exchange Code + PKCE Verifier"] --> N9
    N9["4. Tokens"]
```

### Token Response

```json
{
  "access_token": "...",
  "id_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "scope": "openid profile email offline_access",
  "token_type": "Bearer"
}
```

---

## 🎯 Supported Scopes

| Scope | Description |
|---|---|
| `openid` | Enables OpenID Connect |
| `profile` | Requests user profile information |
| `email` | Requests email claims |
| `offline_access` | Requests refresh token capability; requires appropriate user consent |

Example:

```text
scope=openid profile email offline_access
```

---

## 🎫 Token Types

### Access Token

Used to access protected resources.

### ID Token

Represents the authenticated user and contains OpenID Connect claims.

Example:

```json
{
  "sub": "user-id",
  "aud": "client-id",
  "iss": "http://localhost:3000"
}
```

### Refresh Token

Allows clients to obtain new access tokens without requiring the user to authenticate again.

TSCloak supports refresh token rotation through the underlying OIDC provider.

> ⚠️ A rotated refresh token should not be reused.

---

## 🔑 Using Access Tokens

After completing the authorization flow, TSCloak returns an access token:

```json
{
  "access_token": "ACCESS_TOKEN",
  "expires_in": 3600,
  "id_token": "ID_TOKEN",
  "refresh_token": "REFRESH_TOKEN",
  "scope": "openid profile email offline_access",
  "token_type": "Bearer"
}
```

Use the access token as a **Bearer token** when calling the UserInfo (`/me`) endpoint.

### Get Current User Details

```http
GET /me
Authorization: Bearer ACCESS_TOKEN
```

Using `curl`:

```bash
curl http://localhost:3000/me \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

Example response:

```json
{
  "sub": "0804b05f-960c-46ac-b0c2-a8d6313b5143",
  "name": "siva",
  "preferred_username": "siva",
  "email": "siva@example.com",
  "email_verified": true
}
```

The `/me` endpoint validates the access token and returns identity claims based on the scopes granted to the client.

---

## ♻️ Refreshing an Access Token

When the access token expires, use the refresh token to obtain a new token set without requiring the user to sign in again.

A refresh token is issued when the authorization request includes `offline_access`, the client is configured to allow the `refresh_token` grant, and the required user consent is obtained.

For a standard authorization request, explicitly request consent:

```text
scope=openid profile email offline_access
&prompt=consent
```

`offline_access` is a special OIDC scope. Without explicit consent, the underlying OIDC provider may exclude it from the effective authorization scope, resulting in no refresh token being issued.

### Refresh Token Request

```http
POST /token
Content-Type: application/x-www-form-urlencoded
```

Request body:

```text
grant_type=refresh_token
&refresh_token=REFRESH_TOKEN
&client_id=YOUR_CLIENT_ID
```

Using `curl`:

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=REFRESH_TOKEN" \
  -d "client_id=YOUR_CLIENT_ID"
```

Example response:

```json
{
  "access_token": "NEW_ACCESS_TOKEN",
  "expires_in": 3600,
  "id_token": "NEW_ID_TOKEN",
  "refresh_token": "NEW_REFRESH_TOKEN",
  "scope": "openid profile email offline_access",
  "token_type": "Bearer"
}
```

### Refresh Token Rotation

TSCloak supports refresh token rotation through `oidc-provider`.

```mermaid
flowchart TD
    N0["Old Refresh Token"] --> N1
    N1["POST /token"] --> N2
    N2["grant_type=refresh_token"] --> N3
    N3["New Access Token"] --> N4
    N4["+"] --> N5
    N5["New Refresh Token"] --> N6
    N6["Old Refresh Token Invalidated"]
```

> ⚠️ **Important:** After refresh token rotation, store the newly returned refresh token. Reusing the old refresh token should fail.

### Typical Token Lifecycle

```mermaid
flowchart TD
    N0["User Login"] --> N1
    N1["Authorization Code"] --> N2
    N2["Access Token + Refresh Token"] --> N3
    N3["► Call /me using Access Token"] --> N4
    N4["Access Token Expires"] --> N5
    N5["Use Refresh Token"] --> N6
    N6["New Access Token + New Refresh Token"]
```

---

## 👤 UserInfo Endpoint

User identity claims can be retrieved using the UserInfo endpoint with a valid access token.

Example response:

```json
{
  "sub": "user-id",
  "name": "username",
  "preferred_username": "username",
  "email": "user@example.com",
  "email_verified": true
}
```

---

## ⚡ Dynamic Client Resolution

Clients are resolved dynamically when an authorization request is processed.

TSCloak does **not preload all clients during application startup**.

```mermaid
flowchart TD
    N0["Authorization Request"] --> N1
    N1["client_id"] --> N2
    N2["Client Repository"] --> N3
    N3["Database"] --> N4
    N4["OIDC Client Configuration"]
```

This approach allows client configuration to be managed independently of the OIDC provider lifecycle.

---

## 📝 Dynamic Client Registration

TSCloak supports **OpenID Connect Dynamic Client Registration**, allowing OAuth/OIDC clients to register at runtime instead of requiring every client to be created manually.

The registration endpoint is advertised through the OpenID Connect Discovery document:

```text
GET /.well-known/openid-configuration
```

Example discovery metadata:

```json
{
  "registration_endpoint": "http://localhost:3000/reg"
}
```

### Current Support

| Method | Endpoint | Status |
|---|---|---|
| `POST` | `/reg` | ✅ Implemented |
| `GET` | `/reg/:client_id` | ⏳ Planned |
| `PUT` | `/reg/:client_id` | ⏳ Planned |
| `DELETE` | `/reg/:client_id` | ⏳ Planned |

### Register a Client

```http
POST /reg
Content-Type: application/json
```

Example request:

```json
{
  "client_name": "Test Dynamic Client",
  "redirect_uris": ["http://localhost:4200/callback"],
  "scope": "openid profile email offline_access",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

Using `curl`:

```bash
curl -X POST http://localhost:3000/reg \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Test Dynamic Client",
    "redirect_uris": ["http://localhost:4200/callback"],
    "scope": "openid profile email offline_access",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none"
  }'
```

### Example Response

A successful registration returns dynamically generated client metadata:

```json
{
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "id_token_signed_response_alg": "RS256",
  "require_auth_time": false,
  "response_types": ["code"],
  "subject_type": "public",
  "token_endpoint_auth_method": "none",
  "post_logout_redirect_uris": [],
  "require_pushed_authorization_requests": false,
  "dpop_bound_access_tokens": false,
  "client_id_issued_at": 1788109603,
  "client_id": "generated-client-id",
  "client_name": "Test Dynamic Client",
  "redirect_uris": ["http://localhost:4200/callback"],
  "registration_client_uri": "http://localhost:3000/reg/generated-client-id",
  "registration_access_token": "generated-registration-access-token"
}
```

### Registration Metadata Mapping

TSCloak maps standard Dynamic Client Registration metadata to its internal client model:

| Registration Metadata | Internal Client Property |
|---|---|
| `client_id` | `clientId` |
| `client_secret` | `clientSecret` |
| `client_name` | `name` |
| `redirect_uris` | `redirectUris` |
| `scope` | `allowedScopes` |
| `grant_types` | `grantTypes` |
| `response_types` | `responseTypes` |
| `token_endpoint_auth_method` | `tokenEndpointAuthMethod` |

The standard registration `scope` value is converted internally from:

```text
openid profile email offline_access
```

to:

```text
allowedScopes = [
  "openid",
  "profile",
  "email",
  "offline_access"
]
```

### Using a Dynamically Registered Client

After registration, the returned `client_id` can be used like any other configured OAuth/OIDC client.

```text
http://localhost:3000/auth?
client_id=YOUR_DYNAMIC_CLIENT_ID
&redirect_uri=http://localhost:4200/callback
&response_type=code
&scope=openid profile email offline_access
&code_challenge=CODE_CHALLENGE
&code_challenge_method=S256
```

For public clients using:

```json
{
  "token_endpoint_auth_method": "none"
}
```

PKCE should be used with the Authorization Code Flow.

### Persistence Architecture

Dynamically registered clients are persisted through the existing client repository and TypeORM infrastructure:

```mermaid
flowchart LR
    A["Dynamic Client Registration Request"]
        --> B["OIDC Registration Endpoint"]
    B --> C["oidc-provider"]
    C --> D["OidcClientAdapter"]
    D --> E["Client Repository"]
    E --> F["TypeORM"]
    F --> G[("Database")]
```

This means dynamically registered clients survive application restarts.

> **Current scope:** Client creation through `POST /reg` is implemented. Dynamic Client Registration management operations (`GET`, `PUT`, and `DELETE`) are planned for a future phase.

---

## 💾 Persistent OIDC Storage

OIDC runtime objects are persisted in the database rather than memory.

```mermaid
flowchart TD
    N0["oidc-provider"] --> N1
    N1["┬"] --> N2
    N2["OidcAdapter"] --> N3
    N3["OidcRepository"] --> N4
    N4["TypeOrmOidcRepository"] --> N5
    N5["Database"]
```

This enables OIDC state to survive application restarts.

### Persisted Runtime Objects

The persistence layer supports OIDC models such as:

- AuthorizationCode
- AccessToken
- RefreshToken
- Session
- Grant
- DeviceCode
- BackchannelAuthenticationRequest

---

## 🗄️ Storage Architecture

The OIDC adapter is isolated from database-specific implementations.

```mermaid
flowchart TD
    N0["OidcAdapter"] --> N1
    N1["┬"] --> N2
    N2["OidcRepository"] --> N3
    N3["┴"] --> N4
    N4["TypeORM Repository          Future Repository"] --> N5
    N5["┬       ┬"] --> N6
    N6["SQLite                      PostgreSQL"] --> N7
    N7["Redis / Others"]
```

This allows persistence implementations to evolve without changing OIDC protocol integration.

---

## ⏳ Expiration Handling

OIDC runtime objects have different lifetimes. TSCloak handles expired records using two complementary strategies.

### 1. Lazy Cleanup

When a record is read:

```mermaid
flowchart TD
    N0["Record Requested"] --> N1
    N1["Check Expiration"] --> N2
    N2["┴"] --> N3
    N3["Expired    Valid"] --> N4
    N4["Delete    Return"]
```

Expired records are removed when encountered.

### 2. Background Cleanup

A scheduled background job periodically removes expired records.

```mermaid
flowchart TD
    N0["OIDC Cleanup Service"] --> N1
    N1["┬"] --> N2
    N2["Scheduled Job"] --> N3
    N3["Find Expired Records"] --> N4
    N4["Delete Records"]
```

An index on `expiresAt` improves cleanup query performance.

---

## 🗃️ OIDC Storage Model

OIDC runtime records are stored in a common persistence model.

| Column | Description |
|---|---|
| `id` | OIDC record identifier |
| `model` | OIDC model type |
| `payload` | Serialized OIDC payload |
| `expiresAt` | Record expiration timestamp |
| `grantId` | Associated grant identifier |
| `uid` | OIDC UID lookup identifier |
| `userCode` | Device flow user code |
| `createdAt` | Record creation timestamp |
| `updatedAt` | Record update timestamp |

---

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- Git

### Installation

```bash
git clone <repository-url>
cd TSCloak
npm install
```

### Run in Development

```bash
npm run start:dev
```

### Build

```bash
npm run build
```

### Run in Production

```bash
npm run start:prod
```

---

## 🧪 Example Authorization Request

```text
http://localhost:3000/auth?
client_id=YOUR_CLIENT_ID
&redirect_uri=http://localhost:4200/callback
&response_type=code
&scope=openid profile email offline_access
&prompt=consent
&state=test123
&code_challenge=CODE_CHALLENGE
&code_challenge_method=S256
```

---

## 🔄 Example Token Request

```http
POST /token
Content-Type: application/x-www-form-urlencoded
```

Request body:

```text
grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=http://localhost:4200/callback
&client_id=YOUR_CLIENT_ID
&code_verifier=CODE_VERIFIER
```

---

## 🎯 Design Principles

TSCloak is designed around the following principles:

- **Separation of concerns** — Protocol, identity, clients, and persistence remain independent.
- **Repository abstraction** — Infrastructure is isolated behind application-level contracts.
- **Storage independence** — Persistence implementations can evolve without changing OIDC integration.
- **Dynamic resolution** — Clients are resolved when needed rather than eagerly loaded.
- **Persistent state** — OIDC runtime state survives application restarts.
- **Modular architecture** — NestJS modules represent distinct responsibilities.
- **Protocol isolation** — OAuth/OIDC protocol implementation is delegated to a dedicated provider engine.

---

## 🔒 Token Management Endpoints

TSCloak provides standard OAuth 2.0 token management capabilities through the underlying OIDC provider.

### 🚫 Token Revocation Endpoint

The Token Revocation endpoint allows a client to explicitly invalidate an issued token.

```text
POST /token/revocation
```

Typical use cases include:

- User logout
- Revoking a refresh token
- Revoking compromised credentials
- Preventing future access token renewal

Example request:

```http
POST /token/revocation
Content-Type: application/x-www-form-urlencoded
```

```text
token=REFRESH_TOKEN
&token_type_hint=refresh_token
&client_id=YOUR_CLIENT_ID
```

A successful revocation request returns:

```text
HTTP 200 OK
```

After revocation, attempting to use the revoked refresh token to obtain new access tokens should fail.

```mermaid
flowchart TD
    N0["Refresh Token"] --> N1
    N1["POST /token/revocation"] --> N2
    N2["Token Invalidated"] --> N3
    N3["Cannot Refresh Tokens"]
```

---

### 🔍 Token Introspection Endpoint

The Token Introspection endpoint allows a resource server to query TSCloak and determine whether a token is currently active.

```text
POST /token/introspection
```

A resource API can submit a token to the endpoint:

```mermaid
flowchart TD
    N0["Resource API"] --> N1
    N1["Token Introspection Request"] --> N2
    N2["TSCloak"] --> N3
    N3["Check token validity"] --> N4
    N4["Check expiration"] --> N5
    N5["Check token state"] --> N6
    N6["Return token metadata"]
```

Example response for an active token:

```json
{
  "active": true,
  "scope": "openid profile email",
  "client_id": "YOUR_CLIENT_ID",
  "token_type": "Bearer",
  "sub": "USER_ID",
  "iss": "http://localhost:3000"
}
```

An inactive, expired, or invalid token returns:

```json
{
  "active": false
}
```

### Token Management Summary

| Endpoint | Purpose | Primary Consumer |
|---|---|---|
| `/token` | Issue and refresh tokens | OAuth client |
| `/token/revocation` | Explicitly invalidate a token | OAuth client |
| `/token/introspection` | Check token status and metadata | Resource server/API |
| `/me` | Retrieve authenticated user claims | Client application |

---

## 🗺️ Roadmap

### Implemented

- [x] NestJS application structure
- [x] Client management
- [x] User identity management
- [x] Authorization Code Flow
- [x] PKCE
- [x] Access Tokens
- [x] ID Tokens
- [x] Refresh Tokens
- [x] Refresh Token Rotation
- [x] Offline Access
- [x] Hosted Consent UI
- [x] Persisted User Consent (OIDC Grants)
- [x] Consent Reuse
- [x] Hosted Login UI
- [x] Hosted Consent UI
- [x] Custom Interaction UI support
- [x] Prompt-aware Custom Login / Consent flow
- [x] UserInfo endpoint
- [x] Dynamic client resolution
- [x] Database-backed OIDC persistence
- [x] OIDC state survives application restart
- [x] Lazy expiration cleanup
- [x] Background expiration cleanup
- [x] Token Revocation Endpoint (RFC 7009)
- [x] Token Introspection Endpoint (RFC 7662)
- [x] Dynamic Client Registration (`POST /reg`)

### Planned

- [ ] Client Credentials Flow
- [ ] Dynamic Client Registration Management (`GET` / `PUT` / `DELETE`)
- [ ] PostgreSQL support
- [ ] Redis caching
- [ ] Horizontal scaling
- [ ] Admin API
- [ ] Audit logging

---

## 🤝 Contributing

Contributions, ideas, and architectural discussions are welcome.

Please open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">

Built with ❤️ using NestJS, TypeScript, and OpenID Connect

</div>
