# Client-scoped federated identities migration

The source changes add `clientId` (the internal `clients.id`, not the public OAuth client ID) to `federated_identities` and replace the global unique key `(providerId, subject)` with `(providerId, subject, clientId)`.

Do not rely on TypeORM `synchronize` to backfill this new non-null column. Back up the SQLite database and migrate existing rows first. Existing mappings are assigned to the same client as their linked local user (`users.clientId`).

The SQL below assumes the existing table is named `federated_identities`, references `federation_providers(id)` and `users(id)`, and has the columns shown by the entity. Inspect `SELECT sql FROM sqlite_master WHERE type='table' AND name='federated_identities';` first and adapt column types/defaults if your schema differs. Run it in a single SQLite connection, with foreign keys disabled before the transaction.

```sql
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE federated_identities_new (
  id varchar PRIMARY KEY NOT NULL,
  providerId varchar NOT NULL,
  userId varchar NOT NULL,
  clientId varchar NOT NULL,
  subject varchar NOT NULL,
  email varchar,
  profile text,
  createdAt datetime NOT NULL DEFAULT (datetime('now')),
  updatedAt datetime NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT UQ_federated_identity_provider_subject_client
    UNIQUE (providerId, subject, clientId),
  FOREIGN KEY (providerId) REFERENCES federation_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO federated_identities_new (
  id, providerId, userId, clientId, subject, email, profile, createdAt, updatedAt
)
SELECT
  fi.id, fi.providerId, fi.userId, u.clientId, fi.subject, fi.email,
  fi.profile, fi.createdAt, fi.updatedAt
FROM federated_identities fi
JOIN users u ON u.id = fi.userId;

DROP TABLE federated_identities;
ALTER TABLE federated_identities_new RENAME TO federated_identities;
COMMIT;
PRAGMA foreign_keys = ON;
```

After migration, verify that every federated identity was copied and that the old unique constraint is gone. This script intentionally uses an inner join: any orphan identity row is omitted, so check for orphans before running:

```sql
SELECT fi.id, fi.userId
FROM federated_identities fi
LEFT JOIN users u ON u.id = fi.userId
WHERE u.id IS NULL;
```

If this returns rows, resolve them before migration. Also recreate any additional indexes/triggers that exist on `federated_identities`.
