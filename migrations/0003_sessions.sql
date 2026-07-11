-- Sessioni revocabili + durata configurabile.
-- Ogni login crea una riga: l'id è il jti del JWT. requireAuth verifica che la sessione
-- esista, non sia revocata e non sia scaduta. La revoca è irreversibile: una volta
-- impostato revoked_at, quel token non potrà MAI più autenticare.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,   -- jti (random). È l'identità del token.
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER,            -- NULL = fino a revoca esplicita (nessuna scadenza)
  revoked_at  INTEGER,            -- NULL = attiva. Una volta valorizzato, resta per sempre.
  device      TEXT,               -- etichetta derivata dallo User-Agent
  last_seen   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Preferenza di durata del login (giorni). 0 = fino a revoca esplicita. Default 30 giorni.
ALTER TABLE users ADD COLUMN session_duration_days INTEGER NOT NULL DEFAULT 30;
