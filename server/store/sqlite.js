/**
 * Backend di persistenza SQLite, tramite il modulo integrato `node:sqlite` (Node ≥ 22).
 * Zero dipendenze native. Usato in locale e in qualsiasi ambiente a singola istanza
 * con volume persistente. Su Cloud Run multi-istanza si preferisce Firestore.
 *
 * Il server tratta `encrypted_blob` come stringa opaca: nessun JSON.parse del contenuto.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// node:sqlite è un builtin sperimentale non elencato senza prefisso in
// `module.builtinModules`; alcuni bundler (Vite/Vitest) provano quindi a risolverlo.
// Caricarlo via createRequire a runtime evita del tutto l'analisi statica del bundler.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email_lookup  TEXT NOT NULL UNIQUE,
  auth_hash     TEXT NOT NULL,
  auth_salt     TEXT NOT NULL,
  kek_salt      TEXT NOT NULL,
  wrapped_dek   TEXT NOT NULL,
  dek_iv        TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_data (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_type      TEXT NOT NULL,
  encrypted_blob TEXT NOT NULL,
  iv             TEXT NOT NULL,
  last_modified  INTEGER NOT NULL,
  UNIQUE(user_id, data_type)
);
CREATE TABLE IF NOT EXISTS simulations (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT 0,
  parent_id      TEXT,
  is_main        INTEGER NOT NULL DEFAULT 0,
  encrypted_blob TEXT NOT NULL,
  iv             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_user ON simulations(user_id);
`;

// Migrazioni idempotenti per DB creati con lo schema v1 (aggiunge le colonne scenario).
function migrate(db) {
  const cols = new Set(db.prepare("PRAGMA table_info('simulations')").all().map((c) => c.name));
  const add = (name, def) => {
    if (!cols.has(name)) db.exec(`ALTER TABLE simulations ADD COLUMN ${name} ${def}`);
  };
  add('updated_at', 'INTEGER NOT NULL DEFAULT 0');
  add('parent_id', 'TEXT');
  add('is_main', 'INTEGER NOT NULL DEFAULT 0');
  add('workspace_id', "TEXT NOT NULL DEFAULT 'default'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_simulations_ws ON simulations(user_id, workspace_id)');
  // Sessioni revocabili + durata configurabile (mirror di migrations/0003_sessions.sql).
  const userCols = new Set(db.prepare("PRAGMA table_info('users')").all().map((c) => c.name));
  if (!userCols.has('session_duration_days')) db.exec('ALTER TABLE users ADD COLUMN session_duration_days INTEGER NOT NULL DEFAULT 30');
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    expires_at INTEGER, revoked_at INTEGER, device TEXT, last_seen INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)');
}

export function createSqliteStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);

  const stmts = {
    userByLookup: db.prepare('SELECT * FROM users WHERE email_lookup = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertUser: db.prepare(
      `INSERT INTO users (id, email_lookup, auth_hash, auth_salt, kek_salt, wrapped_dek, dek_iv, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    updateAuth: db.prepare(
      `UPDATE users SET auth_hash = ?, auth_salt = ?, kek_salt = ?, wrapped_dek = ?, dek_iv = ? WHERE id = ?`,
    ),
    getData: db.prepare('SELECT encrypted_blob, iv, last_modified FROM user_data WHERE user_id = ? AND data_type = ?'),
    upsertData: db.prepare(
      `INSERT INTO user_data (id, user_id, data_type, encrypted_blob, iv, last_modified)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, data_type) DO UPDATE SET encrypted_blob = excluded.encrypted_blob, iv = excluded.iv, last_modified = excluded.last_modified`,
    ),
    deleteData: db.prepare('DELETE FROM user_data WHERE user_id = ? AND data_type = ?'),
    listDataTypes: db.prepare('SELECT data_type FROM user_data WHERE user_id = ?'),
    allData: db.prepare('SELECT data_type, encrypted_blob, iv, last_modified FROM user_data WHERE user_id = ?'),
    versions: db.prepare('SELECT data_type, last_modified FROM user_data WHERE user_id = ?'),
    insertSim: db.prepare(
      `INSERT INTO simulations (id, user_id, name, workspace_id, created_at, updated_at, parent_id, is_main, encrypted_blob, iv)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    listSims: db.prepare(
      'SELECT id, name, workspace_id, created_at, updated_at, parent_id, is_main FROM simulations WHERE user_id = ? AND workspace_id = ? ORDER BY is_main DESC, updated_at DESC, created_at DESC',
    ),
    getSim: db.prepare(
      'SELECT id, name, workspace_id, created_at, updated_at, parent_id, is_main, encrypted_blob, iv FROM simulations WHERE user_id = ? AND id = ?',
    ),
    updateSim: db.prepare(
      'UPDATE simulations SET name = ?, encrypted_blob = ?, iv = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    ),
    renameSim: db.prepare('UPDATE simulations SET name = ?, updated_at = ? WHERE user_id = ? AND id = ?'),
    deleteSim: db.prepare('DELETE FROM simulations WHERE user_id = ? AND id = ?'),
    clearMain: db.prepare('UPDATE simulations SET is_main = 0 WHERE user_id = ? AND workspace_id = ?'),
    setMain: db.prepare('UPDATE simulations SET is_main = 1, updated_at = ? WHERE user_id = ? AND id = ?'),
  };

  const simRow = (r) => ({
    id: r.id,
    name: r.name,
    workspaceId: r.workspace_id ?? 'default',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    parentId: r.parent_id ?? null,
    isMain: !!r.is_main,
  });

  return {
    backend: 'sqlite',

    async getUserByEmailLookup(lookup) {
      return stmts.userByLookup.get(lookup) ?? null;
    },
    async getUserById(id) {
      return stmts.userById.get(id) ?? null;
    },
    async createUser(u) {
      stmts.insertUser.run(u.id, u.email_lookup, u.auth_hash, u.auth_salt, u.kek_salt, u.wrapped_dek, u.dek_iv, u.created_at);
    },
    async updateUserAuth(id, a) {
      stmts.updateAuth.run(a.auth_hash, a.auth_salt, a.kek_salt, a.wrapped_dek, a.dek_iv, id);
    },
    async setSessionDuration(id, days) {
      db.prepare('UPDATE users SET session_duration_days = ? WHERE id = ?').run(days, id);
    },

    // -------- sessioni revocabili (mirror del Worker) --------
    async createSession(s) {
      db.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at, device, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(s.id, s.user_id, s.created_at, s.expires_at ?? null, s.revoked_at ?? null, s.device ?? null, s.last_seen);
    },
    async getSession(id) {
      return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) ?? null;
    },
    async listSessions(userId) {
      return db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen DESC').all(userId);
    },
    async touchSession(id, ts) {
      db.prepare('UPDATE sessions SET last_seen = ? WHERE id = ?').run(ts, id);
    },
    async revokeSession(userId, id, ts) {
      const res = db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL').run(ts, id, userId);
      return res.changes > 0;
    },
    async revokeOtherSessions(userId, keepId, ts) {
      const res = db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL').run(ts, userId, keepId);
      return res.changes;
    },
    async updateSessionExpiry(id, expiresAt) {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt ?? null, id);
    },

    async getData(userId, dataType) {
      const row = stmts.getData.get(userId, dataType);
      if (!row) return null;
      return { encryptedBlob: row.encrypted_blob, iv: row.iv, lastModified: row.last_modified };
    },
    async putData(userId, dataType, id, blob, iv, ts) {
      stmts.upsertData.run(id, userId, dataType, blob, iv, ts);
    },
    async deleteData(userId, dataType) {
      stmts.deleteData.run(userId, dataType);
    },
    async listDataTypes(userId) {
      return stmts.listDataTypes.all(userId).map((r) => r.data_type);
    },
    async getAllData(userId) {
      return stmts.allData
        .all(userId)
        .map((r) => ({ dataType: r.data_type, encryptedBlob: r.encrypted_blob, iv: r.iv, lastModified: r.last_modified }));
    },
    async getDataVersions(userId) {
      return stmts.versions.all(userId).map((r) => ({ dataType: r.data_type, lastModified: r.last_modified }));
    },

    async createSimulation(userId, s) {
      stmts.insertSim.run(s.id, userId, s.name, s.workspace_id ?? 'default', s.created_at, s.updated_at ?? s.created_at, s.parent_id ?? null, s.is_main ? 1 : 0, s.encrypted_blob, s.iv);
    },
    async listSimulations(userId, workspaceId = 'default') {
      return stmts.listSims.all(userId, workspaceId).map(simRow);
    },
    async getSimulation(userId, id) {
      const r = stmts.getSim.get(userId, id);
      if (!r) return null;
      return { ...simRow(r), encryptedBlob: r.encrypted_blob, iv: r.iv };
    },
    async updateSimulation(userId, id, patch) {
      const r = stmts.getSim.get(userId, id);
      if (!r) return false;
      if (patch.encrypted_blob != null) stmts.updateSim.run(patch.name ?? r.name, patch.encrypted_blob, patch.iv, patch.updated_at, userId, id);
      else stmts.renameSim.run(patch.name ?? r.name, patch.updated_at, userId, id);
      return true;
    },
    async deleteSimulation(userId, id) {
      stmts.deleteSim.run(userId, id);
    },
    async promoteSimulation(userId, id, ts) {
      const r = stmts.getSim.get(userId, id);
      if (!r) return false;
      stmts.clearMain.run(userId, r.workspace_id ?? 'default');
      stmts.setMain.run(ts, userId, id);
      return true;
    },

    /** Solo per il test `server.blindness`: scandisce OGNI colonna di testo di OGNI tabella. */
    async scanForPlaintext(needle) {
      const hits = [];
      const tables = {
        users: ['id', 'email_lookup', 'auth_hash', 'auth_salt', 'kek_salt', 'wrapped_dek', 'dek_iv'],
        user_data: ['id', 'user_id', 'data_type', 'encrypted_blob', 'iv'],
        simulations: ['id', 'user_id', 'name', 'encrypted_blob', 'iv'],
      };
      for (const [table, cols] of Object.entries(tables)) {
        const rows = db.prepare(`SELECT * FROM ${table}`).all();
        for (const row of rows) {
          for (const c of cols) {
            const v = row[c];
            if (typeof v === 'string' && v.includes(needle)) hits.push(`${table}.${c}`);
          }
        }
      }
      return hits;
    },

    async close() {
      db.close();
    },
  };
}
