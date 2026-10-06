# TSCloak SCIM 2.0

TSCloak exposes SCIM 2.0 user provisioning using the existing OAuth 2.0 client credentials flow.

## Authentication

SCIM does not have a separate permanent API key. A TSCloak Client uses its existing `client_id` and `client_secret` at the OAuth token endpoint:

```http
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=scim
```

The returned short-lived OAuth access token is sent to SCIM:

```http
Authorization: Bearer <ACCESS_TOKEN>
```

The token is validated as a TSCloak-signed JWT. The token's `client_id` determines the tenant/client scope. A request can only access users whose `clientId` matches the authenticated client.

## Client configuration

The client must have both:

- `client_credentials` in `grantTypes`
- `scim` in `allowedScopes`

The client must also use a confidential token endpoint authentication method such as `client_secret_basic` or `client_secret_post`.

The default TSCloak access-token lifetime is controlled by the security policy (15 minutes by default). No separate SCIM credential is stored in the database.

## Endpoints

```text
GET    /scim/v2/ServiceProviderConfig
GET    /scim/v2/ResourceTypes
GET    /scim/v2/Schemas

GET    /scim/v2/Users
POST   /scim/v2/Users
GET    /scim/v2/Users/:id
PUT    /scim/v2/Users/:id
PATCH  /scim/v2/Users/:id
DELETE /scim/v2/Users/:id
```

`DELETE` is implemented as deactivation (`active=false`) so that the TSCloak identity is not physically removed.

## Tenant isolation

The SCIM request never accepts a `clientId` from the SCIM resource payload. The authenticated OAuth access token supplies the client identity:

```text
client_id + client_secret
        ↓
client_credentials token
        ↓
client_id claim
        ↓
SCIM request context
        ↓
User.clientId = authenticated client
```

This prevents a SCIM caller for Client A from provisioning or reading Client B users.
