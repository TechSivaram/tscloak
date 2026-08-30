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
- 💾 Persistent OIDC runtime state
- 🔄 State survives application restarts
- 🧹 Automatic expiration cleanup
- 🗄️ Repository-based persistence abstraction

---

## 🖥️ Login Experience

TsCloak provides an authentication interaction page for users to securely sign in before authorization is completed.

<div align="center">

![TsCloak Login Screen](docs/images/tscloak-login.png)

*TsCloak authentication interaction page*

</div>

---

## 🏗️ Architecture

```text
                              ┌─────────────────────┐
                              │     Client App      │
                              │   SPA / Web / API   │
                              └──────────┬──────────┘
                                         │
                                    OAuth / OIDC
                                         │
                                         ▼
                        ┌────────────────────────────────┐
                        │            TsCloak             │
                        │          NestJS Host           │
                        └───────────────┬────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            │                           │                           │
            ▼                           ▼                           ▼
    ┌───────────────┐           ┌───────────────┐          ┌───────────────┐
    │    Clients    │           │   Identity    │          │     OIDC      │
    │    Module     │           │    Module     │          │    Module     │
    └───────┬───────┘           └───────┬───────┘          └───────┬───────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        │
                                        ▼
                           ┌────────────────────────┐
                           │ Repository Abstractions │
                           └────────────┬───────────┘
                                        │
                                        ▼
                           ┌────────────────────────┐
                           │        TypeORM         │
                           └────────────┬───────────┘
                                        │
                                        ▼
                           ┌────────────────────────┐
                           │       SQLite DB        │
                           └────────────────────────┘
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

```text
src/
│
├── clients/
│   ├── entities/
│   ├── repositories/
│   └── services/
│
├── identity/
│   ├── entities/
│   └── services/
│
├── sessions/
│   ├── entities/
│   └── services/
│
├── oidc/
│   ├── adapters/
│   ├── entities/
│   ├── repositories/
│   ├── oidc-options.service.ts
│   ├── oidc-cleanup.service.ts
│   └── oidc.module.ts
│
├── app.module.ts
└── main.ts
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

TsCloak currently supports the **Authorization Code Flow with PKCE**.

```text
┌──────────────┐                                  ┌──────────────────┐
│              │                                  │                  │
│  Client App  │                                  │     TsCloak      │
│              │                                  │                  │
└──────┬───────┘                                  └────────┬─────────┘
       │                                                   │
       │  1. Authorization Request + PKCE Challenge        │
       │──────────────────────────────────────────────────>│
       │                                                   │
       │                                                   │ Authenticate
       │                                                   │ User
       │                                                   │
       │  2. Redirect with Authorization Code              │
       │<──────────────────────────────────────────────────│
       │                                                   │
       │  3. Exchange Code + PKCE Verifier                 │
       │──────────────────────────────────────────────────>│
       │                                                   │
       │  4. Tokens                                        │
       │<──────────────────────────────────────────────────│
       │                                                   │
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
| `offline_access` | Enables refresh token issuance |

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

TsCloak supports refresh token rotation through the underlying OIDC provider.

> ⚠️ A rotated refresh token should not be reused.

---

## 🔑 Using Access Tokens

After completing the authorization flow, TsCloak returns an access token:

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

A refresh token is issued when the authorization request includes:

```text
scope=openid profile email offline_access
```

and the client is configured to allow the `refresh_token` grant.

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

TsCloak supports refresh token rotation through `oidc-provider`.

```text
Old Refresh Token
       │
       ▼
POST /token
grant_type=refresh_token
       │
       ▼
New Access Token
+
New Refresh Token
       │
       ▼
Old Refresh Token Invalidated
```

> ⚠️ **Important:** After refresh token rotation, store the newly returned refresh token. Reusing the old refresh token should fail.

### Typical Token Lifecycle

```text
User Login
    │
    ▼
Authorization Code
    │
    ▼
Access Token + Refresh Token
    │
    ├──► Call /me using Access Token
    │
    ▼
Access Token Expires
    │
    ▼
Use Refresh Token
    │
    ▼
New Access Token + New Refresh Token
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

TsCloak does **not preload all clients during application startup**.

```text
Authorization Request
        │
        ▼
    client_id
        │
        ▼
Client Repository
        │
        ▼
Database
        │
        ▼
OIDC Client Configuration
```

This approach allows client configuration to be managed independently of the OIDC provider lifecycle.

---

## 💾 Persistent OIDC Storage

OIDC runtime objects are persisted in the database rather than memory.

```text
┌─────────────────┐
│  oidc-provider  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   OidcAdapter   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OidcRepository  │
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ TypeOrmOidcRepository│
└───────────┬──────────┘
            │
            ▼
┌─────────────────┐
│    Database     │
└─────────────────┘
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

```text
                   ┌─────────────────┐
                   │   OidcAdapter   │
                   └────────┬────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ OidcRepository  │
                   └────────┬────────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
             ▼                             ▼
  ┌─────────────────────┐       ┌─────────────────────┐
  │ TypeORM Repository  │       │ Future Repository   │
  │                     │       │                     │
  └──────────┬──────────┘       └──────────┬──────────┘
             │                             │
             ▼                             ▼
          SQLite                      PostgreSQL
                                    Redis / Others
```

This allows persistence implementations to evolve without changing OIDC protocol integration.

---

## ⏳ Expiration Handling

OIDC runtime objects have different lifetimes. TsCloak handles expired records using two complementary strategies.

### 1. Lazy Cleanup

When a record is read:

```text
Record Requested
       │
       ▼
Check Expiration
       │
   ┌───┴────┐
   │        │
Expired    Valid
   │        │
   ▼        ▼
Delete    Return
```

Expired records are removed when encountered.

### 2. Background Cleanup

A scheduled background job periodically removes expired records.

```text
┌──────────────────────┐
│ OIDC Cleanup Service │
└──────────┬───────────┘
           │
           ▼
     Scheduled Job
           │
           ▼
   Find Expired Records
           │
           ▼
     Delete Records
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
cd tscloak
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

TsCloak is designed around the following principles:

- **Separation of concerns** — Protocol, identity, clients, and persistence remain independent.
- **Repository abstraction** — Infrastructure is isolated behind application-level contracts.
- **Storage independence** — Persistence implementations can evolve without changing OIDC integration.
- **Dynamic resolution** — Clients are resolved when needed rather than eagerly loaded.
- **Persistent state** — OIDC runtime state survives application restarts.
- **Modular architecture** — NestJS modules represent distinct responsibilities.
- **Protocol isolation** — OAuth/OIDC protocol implementation is delegated to a dedicated provider engine.

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
- [x] UserInfo endpoint
- [x] Dynamic client resolution
- [x] Database-backed OIDC persistence
- [x] OIDC state survives application restart
- [x] Lazy expiration cleanup
- [x] Background expiration cleanup

### Planned

- [ ] Client Credentials Flow
- [ ] Token Revocation Endpoint
- [ ] Token Introspection Endpoint
- [ ] Dynamic Client Registration
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
