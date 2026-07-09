/** Factory del backend di persistenza, selezionato via STORE_BACKEND.
 *  Import dinamico: in modalità firestore non carichiamo node:sqlite (e viceversa). */
let singleton = null;

export async function getStore() {
  if (singleton) return singleton;
  const backend = (process.env.STORE_BACKEND || 'sqlite').toLowerCase();
  if (backend === 'firestore') {
    const { createFirestoreStore } = await import('./firestore.js');
    singleton = await createFirestoreStore();
  } else {
    const { createSqliteStore } = await import('./sqlite.js');
    const path = process.env.SQLITE_PATH || './data/k-prevention.db';
    singleton = createSqliteStore(path);
  }
  return singleton;
}

/** Per i test: forza un backend SQLite in-memory isolato. */
export async function createMemoryStore() {
  const { createSqliteStore } = await import('./sqlite.js');
  return createSqliteStore(':memory:');
}
