# TSCloak federation client-scoped provisioning fix

This bundle is based on the current `src.zip` you supplied. It changes first-time
federation so a verified Google/OIDC identity can be linked to an existing local
user for the requesting client, or provision a new local user if that email does
not yet exist for that client.

## Changed files

- `src/federation/federation.service.ts`
  - Keeps identity lookup scoped to the internal client UUID.
  - Requires a verified email.
  - Reuses an enabled user only within the requesting client.
  - Creates a new local user for the requesting client when no account with that
    email exists there, then creates the client-scoped federated identity mapping.
  - Rejects disabled matching accounts rather than bypassing them.
- `src/identity/identity.service.ts`
  - Exposes a federation-specific email lookup.
- `src/identity/repositories/user.repository.ts`
  - Adds the repository contract for that lookup.
- `src/identity/repositories/typeorm-user.repository.ts`
  - Implements a case-insensitive email lookup scoped to the public client ID,
    including disabled users so a disabled account cannot be bypassed.

## Important behavior

- `users.clientId` is set using the internal `clients.id` UUID. The service passes
  the public client ID to `IdentityService.createFederatedUser()`, which resolves
  it to the internal UUID before saving.
- A different client gets a different local user, even when the Google email is
  the same.
- The external subject mapping remains scoped by `(providerId, subject, clientId)`.
- Account provisioning requires `email_verified === true`.
- The generated local account gets a random password and a generated username.
  It should be used for federated sign-in, not password sign-in.
- The configured `USER` role must exist, since `createFederatedUser()` uses the
  normal local-user creation path.

## Apply and test

1. Back up the project and database.
2. Copy the updated files from this bundle's `src/` directory into the matching
   locations in your project.
3. Confirm your database schema already reflects the current entities:
   - `users` has composite uniqueness for `(username, clientId)` and
     `(email, clientId)`, not global uniqueness on username/email.
   - `federated_identities` has `clientId` and composite uniqueness for
     `(providerId, subject, clientId)`.
4. Run the project's normal build.
5. Test:
   - Client A first login creates a user and mapping for Client A.
   - Client B first login with the same verified Google email creates a separate
     user and mapping for Client B.
   - Repeat login in each client reuses that client's mapping.
   - A disabled account in a client cannot be bypassed by federation.

This source bundle does not include your database file or migration runner.
