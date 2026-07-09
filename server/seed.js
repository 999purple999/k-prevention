/**
 * Seed dell'utente predefinito "Francesco Pernice" (CLI).
 * Deriva le chiavi come il browser (stesso modulo crypto isomorfo), cifra l'intero
 * dataset e memorizza utente + blob. Nessuna password lascia il sistema in chiaro.
 *
 * Uso:
 *   node server/seed.js                              # genera una password complessa e la stampa
 *   FRANCESCO_PASSWORD="..." node server/seed.js     # password fissa (deploy riproducibile)
 *
 * NB: su Cloud Run il seed avviene automaticamente all'avvio (SEED_ON_START=1), nello
 * stesso processo del server: stesso SERVER_SECRET e ADC del service account.
 */
import { loadEnv } from './lib/env.js';
loadEnv();

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getStore } from './store/index.js';
import { seedFrancesco } from './lib/seedFrancesco.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const store = await getStore();
  const email = process.env.FRANCESCO_EMAIL || undefined;
  const result = await seedFrancesco(store, { password: process.env.FRANCESCO_PASSWORD, email, createOnly: false });

  console.log(result.created ? `✓ Utente creato (id=${result.userId}).` : `ℹ︎ Utente esistente aggiornato (id=${result.userId}).`);
  console.log(`✓ ${result.blobCount} blob cifrati e salvati (backend=${store.backend}).`);

  const creds = [
    '=== k-prevention · credenziali utente predefinito ===',
    `Nome:     Francesco Pernice`,
    `Email:    ${result.email}`,
    `Password: ${result.password}`,
    '',
    'Conserva questa password: non è recuperabile (i dati sono cifrati end-to-end con una chiave derivata dalla password).',
  ].join('\n');
  try {
    writeFileSync(join(ROOT, 'FRANCESCO_CREDENTIALS.txt'), creds + '\n');
  } catch { /* ignore */ }

  console.log('\n' + '─'.repeat(56));
  console.log(creds);
  console.log('─'.repeat(56) + '\n');

  await store.close();
}

main().catch((err) => {
  console.error('Seed fallito:', err);
  process.exit(1);
});
