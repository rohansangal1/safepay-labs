-- Researcher portal schema. Apply with: npm run researcher -- init
-- Idempotent, so it is safe to run again after an upgrade.

CREATE TABLE IF NOT EXISTS researchers (
  email         text PRIMARY KEY,          -- lower-cased; what the researcher signs in with
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

-- Signed-in browsers. `token_hash` is a SHA-256 of the cookie value, so a copy of this table
-- cannot be used to sign in. Deleting a researcher signs them out everywhere.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  email      text NOT NULL REFERENCES researchers (email) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);

-- Admins can open /devs/admin and manage accounts there.
ALTER TABLE researchers ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- When this browser last proved the password. The admin page asks again once this is stale.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS admin_confirmed_at timestamptz;

-- Every account change, whether made on the admin page or in the terminal.
CREATE TABLE IF NOT EXISTS admin_audit (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at     timestamptz NOT NULL,
  actor  text NOT NULL,
  action text NOT NULL,
  target text NOT NULL
);
