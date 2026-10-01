-- Researcher portal schema. Apply with: npm run researcher -- init
-- Idempotent, so it is safe to run again after an upgrade.

CREATE TABLE IF NOT EXISTS researchers (
  email         text PRIMARY KEY,          -- lower-cased; also the Basic-auth username
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,             -- Argon2id, never the password
  disabled      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz
);

-- Failed sign-in counters. `key` is a SHA-256 of "email:<address>" or "ip:<address>", so the
-- table holds no raw addresses. One fixed window per key.
CREATE TABLE IF NOT EXISTS auth_failures (
  key          text PRIMARY KEY,
  count        integer NOT NULL,
  window_start timestamptz NOT NULL
);
