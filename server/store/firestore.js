/**
 * Backend Firestore per Cloud Run. Sopravvive a cold start e a più istanze
 * (a differenza di un file SQLite sul filesystem effimero del container).
 * Su Cloud Run le credenziali arrivano dalle Application Default Credentials.
 *
 * Collezioni:
 *   users/{id}
 *   users/{id}/data/{dataType}
 *   users/{id}/simulations/{simId}
 * Un indice ausiliario email_index/{email_lookup} → { userId } consente la ricerca
 * per email in O(1) senza query (email_lookup è deterministico e non invertibile).
 */
export async function createFirestoreStore() {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined,
    databaseId: process.env.FIRESTORE_DATABASE_ID || undefined,
    ignoreUndefinedProperties: true,
  });

  const users = db.collection('users');
  const emailIndex = db.collection('email_index');

  return {
    backend: 'firestore',

    async getUserByEmailLookup(lookup) {
      const idx = await emailIndex.doc(lookup).get();
      if (!idx.exists) return null;
      const snap = await users.doc(idx.data().userId).get();
      return snap.exists ? snap.data() : null;
    },
    async getUserById(id) {
      const snap = await users.doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async createUser(u) {
      const batch = db.batch();
      batch.set(users.doc(u.id), u);
      batch.set(emailIndex.doc(u.email_lookup), { userId: u.id });
      await batch.commit();
    },
    async updateUserAuth(id, a) {
      await users.doc(id).set(
        { auth_hash: a.auth_hash, auth_salt: a.auth_salt, kek_salt: a.kek_salt, wrapped_dek: a.wrapped_dek, dek_iv: a.dek_iv },
        { merge: true },
      );
    },

    async getData(userId, dataType) {
      const snap = await users.doc(userId).collection('data').doc(dataType).get();
      if (!snap.exists) return null;
      const d = snap.data();
      return { encryptedBlob: d.encrypted_blob, iv: d.iv, lastModified: d.last_modified };
    },
    async putData(userId, dataType, id, blob, iv, ts) {
      await users.doc(userId).collection('data').doc(dataType).set({
        id,
        data_type: dataType,
        encrypted_blob: blob,
        iv,
        last_modified: ts,
      });
    },
    async deleteData(userId, dataType) {
      await users.doc(userId).collection('data').doc(dataType).delete();
    },
    async listDataTypes(userId) {
      const snap = await users.doc(userId).collection('data').get();
      return snap.docs.map((d) => d.id);
    },
    async getAllData(userId) {
      const snap = await users.doc(userId).collection('data').get();
      return snap.docs.map((d) => {
        const v = d.data();
        return { dataType: d.id, encryptedBlob: v.encrypted_blob, iv: v.iv, lastModified: v.last_modified };
      });
    },
    async getDataVersions(userId) {
      const snap = await users.doc(userId).collection('data').get();
      return snap.docs.map((d) => ({ dataType: d.id, lastModified: d.data().last_modified }));
    },

    async createSimulation(userId, s) {
      await users.doc(userId).collection('simulations').doc(s.id).set({
        id: s.id,
        name: s.name,
        created_at: s.created_at,
        updated_at: s.updated_at ?? s.created_at,
        parent_id: s.parent_id ?? null,
        is_main: !!s.is_main,
        encrypted_blob: s.encrypted_blob,
        iv: s.iv,
      });
    },
    async listSimulations(userId) {
      const snap = await users.doc(userId).collection('simulations').get();
      return snap.docs
        .map((d) => {
          const v = d.data();
          return { id: v.id, name: v.name, createdAt: v.created_at, updatedAt: v.updated_at ?? v.created_at, parentId: v.parent_id ?? null, isMain: !!v.is_main };
        })
        .sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.updatedAt - a.updatedAt);
    },
    async getSimulation(userId, id) {
      const snap = await users.doc(userId).collection('simulations').doc(id).get();
      if (!snap.exists) return null;
      const d = snap.data();
      return { id: d.id, name: d.name, createdAt: d.created_at, updatedAt: d.updated_at ?? d.created_at, parentId: d.parent_id ?? null, isMain: !!d.is_main, encryptedBlob: d.encrypted_blob, iv: d.iv };
    },
    async updateSimulation(userId, id, patch) {
      const ref = users.doc(userId).collection('simulations').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return false;
      const upd = { updated_at: patch.updated_at };
      if (patch.name != null) upd.name = patch.name;
      if (patch.encrypted_blob != null) { upd.encrypted_blob = patch.encrypted_blob; upd.iv = patch.iv; }
      await ref.set(upd, { merge: true });
      return true;
    },
    async deleteSimulation(userId, id) {
      await users.doc(userId).collection('simulations').doc(id).delete();
    },
    async promoteSimulation(userId, id, ts) {
      const col = users.doc(userId).collection('simulations');
      const target = await col.doc(id).get();
      if (!target.exists) return false;
      const all = await col.where('is_main', '==', true).get();
      const batch = db.batch();
      all.docs.forEach((d) => batch.set(d.ref, { is_main: false }, { merge: true }));
      batch.set(col.doc(id), { is_main: true, updated_at: ts }, { merge: true });
      await batch.commit();
      return true;
    },

    async scanForPlaintext() {
      // Non usato in produzione; il test server.blindness gira sul backend SQLite.
      return [];
    },
    async close() {
      await db.terminate();
    },
  };
}
