/** Factory del backend di persistenza, selezionato via STORE_BACKEND. */
import { createSqliteStore } from './sqlite.js';
import { createFirestoreStore } from './firestore.js';

let singleton = null;

export async function getStore() {
  if (singleton) return singleton;
  const backend = (process.env.STORE_BACKEND || 'sqlite').toLowerCase();
  if (backend === 'firestore') {
    singleton = await createFirestoreStore();
  } else {
    const path = process.env.SQLITE_PATH || './data/k-prevention.db';
    singleton = createSqliteStore(path);
  }
  return singleton;
}

/** Per i test: forza un backend SQLite in-memory isolato. */
export function createMemoryStore() {
  return createSqliteStore(':memory:');
}
