/** Store D1 (Cloudflare). Stessa interfaccia degli store SQLite/Firestore, ma async.
 *  Il server tratta encrypted_blob come stringa opaca: nessun JSON.parse del contenuto. */

export interface UserRow {
  id: string;
  email_lookup: string;
  auth_hash: string;
  auth_salt: string;
  kek_salt: string;
  wrapped_dek: string;
  dek_iv: string;
  created_at: number;
}

export function createD1Store(db: D1Database) {
  return {
    backend: 'd1' as const,

    async getUserByEmailLookup(lookup: string): Promise<UserRow | null> {
      return db.prepare('SELECT * FROM users WHERE email_lookup = ?').bind(lookup).first<UserRow>();
    },
    async getUserById(id: string): Promise<UserRow | null> {
      return db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
    },
    async createUser(u: UserRow): Promise<void> {
      await db
        .prepare('INSERT INTO users (id, email_lookup, auth_hash, auth_salt, kek_salt, wrapped_dek, dek_iv, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(u.id, u.email_lookup, u.auth_hash, u.auth_salt, u.kek_salt, u.wrapped_dek, u.dek_iv, u.created_at)
        .run();
    },
    async updateUserAuth(id: string, a: { auth_hash: string; auth_salt: string; kek_salt: string; wrapped_dek: string; dek_iv: string }): Promise<void> {
      await db
        .prepare('UPDATE users SET auth_hash = ?, auth_salt = ?, kek_salt = ?, wrapped_dek = ?, dek_iv = ? WHERE id = ?')
        .bind(a.auth_hash, a.auth_salt, a.kek_salt, a.wrapped_dek, a.dek_iv, id)
        .run();
    },

    async getData(userId: string, dataType: string) {
      const row = await db
        .prepare('SELECT encrypted_blob, iv, last_modified FROM user_data WHERE user_id = ? AND data_type = ?')
        .bind(userId, dataType)
        .first<{ encrypted_blob: string; iv: string; last_modified: number }>();
      if (!row) return null;
      return { encryptedBlob: row.encrypted_blob, iv: row.iv, lastModified: row.last_modified };
    },
    async putData(userId: string, dataType: string, id: string, blob: string, iv: string, ts: number): Promise<void> {
      await db
        .prepare(
          `INSERT INTO user_data (id, user_id, data_type, encrypted_blob, iv, last_modified) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, data_type) DO UPDATE SET encrypted_blob = excluded.encrypted_blob, iv = excluded.iv, last_modified = excluded.last_modified`,
        )
        .bind(id, userId, dataType, blob, iv, ts)
        .run();
    },
    async deleteData(userId: string, dataType: string): Promise<void> {
      await db.prepare('DELETE FROM user_data WHERE user_id = ? AND data_type = ?').bind(userId, dataType).run();
    },
    async getAllData(userId: string) {
      const { results } = await db
        .prepare('SELECT data_type, encrypted_blob, iv, last_modified FROM user_data WHERE user_id = ?')
        .bind(userId)
        .all<{ data_type: string; encrypted_blob: string; iv: string; last_modified: number }>();
      return (results ?? []).map((r) => ({ dataType: r.data_type, encryptedBlob: r.encrypted_blob, iv: r.iv, lastModified: r.last_modified }));
    },
    async getDataVersions(userId: string) {
      const { results } = await db
        .prepare('SELECT data_type, last_modified FROM user_data WHERE user_id = ?')
        .bind(userId)
        .all<{ data_type: string; last_modified: number }>();
      return (results ?? []).map((r) => ({ dataType: r.data_type, lastModified: r.last_modified }));
    },

    async createSimulation(userId: string, s: { id: string; name: string; workspace_id: string; created_at: number; updated_at: number; parent_id: string | null; is_main: boolean; encrypted_blob: string; iv: string }): Promise<void> {
      await db
        .prepare('INSERT INTO simulations (id, user_id, name, workspace_id, created_at, updated_at, parent_id, is_main, encrypted_blob, iv) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(s.id, userId, s.name, s.workspace_id, s.created_at, s.updated_at, s.parent_id, s.is_main ? 1 : 0, s.encrypted_blob, s.iv)
        .run();
    },
    async listSimulations(userId: string, workspaceId = 'default') {
      const { results } = await db
        .prepare('SELECT id, name, workspace_id, created_at, updated_at, parent_id, is_main FROM simulations WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC')
        .bind(userId, workspaceId)
        .all<{ id: string; name: string; workspace_id: string; created_at: number; updated_at: number; parent_id: string | null; is_main: number }>();
      return (results ?? []).map((r) => ({ id: r.id, name: r.name, workspaceId: r.workspace_id, createdAt: r.created_at, updatedAt: r.updated_at, parentId: r.parent_id, isMain: !!r.is_main }));
    },
    async getSimulation(userId: string, id: string) {
      const r = await db
        .prepare('SELECT id, name, created_at, updated_at, parent_id, is_main, encrypted_blob, iv FROM simulations WHERE user_id = ? AND id = ?')
        .bind(userId, id)
        .first<{ id: string; name: string; created_at: number; updated_at: number; parent_id: string | null; is_main: number; encrypted_blob: string; iv: string }>();
      if (!r) return null;
      return { id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, parentId: r.parent_id, isMain: !!r.is_main, encryptedBlob: r.encrypted_blob, iv: r.iv };
    },
    async updateSimulation(userId: string, id: string, patch: { name?: string; encrypted_blob?: string; iv?: string; updated_at: number }): Promise<boolean> {
      const res = await db
        .prepare('UPDATE simulations SET name = COALESCE(?, name), encrypted_blob = COALESCE(?, encrypted_blob), iv = COALESCE(?, iv), updated_at = ? WHERE user_id = ? AND id = ?')
        .bind(patch.name ?? null, patch.encrypted_blob ?? null, patch.iv ?? null, patch.updated_at, userId, id)
        .run();
      return (res.meta?.changes ?? 0) > 0;
    },
    async deleteSimulation(userId: string, id: string): Promise<void> {
      await db.prepare('DELETE FROM simulations WHERE user_id = ? AND id = ?').bind(userId, id).run();
    },
    async promoteSimulation(userId: string, id: string, ts: number): Promise<boolean> {
      const row = await db.prepare('SELECT workspace_id FROM simulations WHERE user_id = ? AND id = ?').bind(userId, id).first<{ workspace_id: string }>();
      if (!row) return false;
      // «principale» è per-workspace: azzera solo gli scenari dello stesso workspace.
      await db.batch([
        db.prepare('UPDATE simulations SET is_main = 0 WHERE user_id = ? AND workspace_id = ?').bind(userId, row.workspace_id),
        db.prepare('UPDATE simulations SET is_main = 1, updated_at = ? WHERE user_id = ? AND id = ?').bind(ts, userId, id),
      ]);
      return true;
    },
  };
}

export type D1Store = ReturnType<typeof createD1Store>;
