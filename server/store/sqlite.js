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
  encrypted_blob TEXT NOT NULL,
  iv             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_data_user ON user_data(user_id);
CREATE INDEX IF NOT EXISTS idx_simulations_user ON simulations(user_id);
`;

export function createSqliteStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

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
    insertSim: db.prepare(
      'INSERT INTO simulations (id, user_id, name, created_at, encrypted_blob, iv) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    listSims: db.prepare('SELECT id, name, created_at FROM simulations WHERE user_id = ? ORDER BY created_at DESC'),
    getSim: db.prepare('SELECT id, name, created_at, encrypted_blob, iv FROM simulations WHERE user_id = ? AND id = ?'),
  };

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

    async createSimulation(userId, s) {
      stmts.insertSim.run(s.id, userId, s.name, s.created_at, s.encrypted_blob, s.iv);
    },
    async listSimulations(userId) {
      return stmts.listSims.all(userId).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
    },
    async getSimulation(userId, id) {
      const row = stmts.getSim.get(userId, id);
      if (!row) return null;
      return { id: row.id, name: row.name, createdAt: row.created_at, encryptedBlob: row.encrypted_blob, iv: row.iv };
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
