-- k-prevention — schema D1 (Cloudflare). Mirror di quello SQLite/Firestore.
-- Il server è un passacarte cieco: encrypted_blob è opaco, mai interpretato.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email_lookup  TEXT NOT NULL UNIQUE,   -- HMAC-SHA256(SERVER_SECRET, lower(email)). Deterministico.
  auth_hash     TEXT NOT NULL,          -- ri-hash lato server dell'authProof (PBKDF2)
  auth_salt     TEXT NOT NULL,          -- sale per derivare l'authProof (client)
  kek_salt      TEXT NOT NULL,          -- sale per derivare la KEK (client). DIVERSO da auth_salt.
  wrapped_dek   TEXT NOT NULL,          -- DEK cifrata con la KEK
  dek_iv        TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_data (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  data_type      TEXT NOT NULL,
  encrypted_blob TEXT NOT NULL,
  iv             TEXT NOT NULL,
  last_modified  INTEGER NOT NULL,
  UNIQUE(user_id, data_type)
);

CREATE TABLE IF NOT EXISTS simulations (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL,
  name           TEXT NOT NULL,          -- NON cifrato: serve per la lista. Avvisato in UI.
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  parent_id      TEXT,                   -- ramo genitore (scenari stile Git)
  is_main        INTEGER NOT NULL DEFAULT 0,
  encrypted_blob TEXT NOT NULL,
  iv             TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_user ON simulations(user_id);
