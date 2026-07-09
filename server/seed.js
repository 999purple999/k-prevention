/**
 * Seed dell'utente predefinito "Francesco Pernice".
 * Deriva le chiavi ESATTAMENTE come farebbe il browser (stesso modulo crypto isomorfo),
 * cifra l'intero dataset con la DEK e memorizza utente + blob. Al primo login Francesco
 * trova già tutti i dati, cifrati end-to-end: nemmeno il seed lascia password in chiaro.
 *
 * Uso:
 *   node server/seed.js                     # genera una password complessa e la stampa
 *   FRANCESCO_PASSWORD="..." node server/seed.js   # usa una password fissa (deploy riproducibile)
 */
import { loadEnv } from './lib/env.js';
loadEnv();

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { getStore } from './store/index.js';
import { emailLookup, hashAuthProof, newId } from './lib/serverCrypto.js';
import {
  deriveAuthProof,
  deriveKEK,
  generateDEK,
  wrapDEK,
  encryptData,
  randomSaltB64,
  aadFor,
} from '../src/lib/crypto.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EMAIL = process.env.FRANCESCO_EMAIL || 'francesco.pernice@k-prevention.app';
const NAME = 'Francesco Pernice';

function generatePassword() {
  // Charset senza caratteri ambigui (0/O, 1/l/I) per una password robusta ma trascrivibile.
  const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const L = 'abcdefghijkmnpqrstuvwxyz';
  const D = '23456789';
  const S = '!@#$%&*?-+';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  // 4 blocchi separati da trattino, ogni classe rappresentata più volte → ~ 22 caratteri, alta entropia.
  const raw = pick(U, 3) + pick(L, 5) + pick(D, 4) + pick(S, 2) + pick(L, 4) + pick(U, 2) + pick(D, 2) + pick(S, 1);
  // mescola
  const arr = raw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

async function main() {
  const store = await getStore();
  const password = process.env.FRANCESCO_PASSWORD || generatePassword();

  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'francesco_dataset.json'), 'utf8'));

  // Deriva le chiavi come il client.
  const authSalt = randomSaltB64();
  const kekSalt = randomSaltB64();
  const authProof = await deriveAuthProof(password, authSalt);
  const kek = await deriveKEK(password, kekSalt);
  const dek = await generateDEK();
  const { wrappedDek, iv: dekIv } = await wrapDEK(dek, kek);

  const lookup = emailLookup(EMAIL);
  const existing = await store.getUserByEmailLookup(lookup);
  const userId = existing ? existing.id : newId();

  if (existing) {
    await store.updateUserAuth(userId, { auth_hash: hashAuthProof(authProof), auth_salt: authSalt, kek_salt: kekSalt, wrapped_dek: wrappedDek, dek_iv: dekIv });
    console.log(`ℹ︎ Utente esistente aggiornato (id=${userId}).`);
  } else {
    await store.createUser({
      id: userId,
      email_lookup: lookup,
      auth_hash: hashAuthProof(authProof),
      auth_salt: authSalt,
      kek_salt: kekSalt,
      wrapped_dek: wrappedDek,
      dek_iv: dekIv,
      created_at: Date.now(),
    });
    console.log(`✓ Utente creato (id=${userId}).`);
  }

  // Blob cifrati per tipo.
  const blobs = {
    profile: { name: NAME, email: EMAIL },
    incomeStreams: dataset.incomeStreams,
    expenses: dataset.expenses,
    organicParameters: dataset.organicParameters,
    taxModel: { ...dataset.taxModel, _unverified: dataset._unverified ?? [] },
    simulationConfig: dataset.simulationConfig,
    monteCarlo: dataset.monteCarlo,
  };
  for (const [type, obj] of Object.entries(blobs)) {
    const { ciphertext, iv } = await encryptData(obj, dek, aadFor(userId, type));
    await store.putData(userId, type, newId(), ciphertext, iv, Date.now());
  }
  console.log(`✓ ${Object.keys(blobs).length} blob cifrati e salvati (backend=${store.backend}).`);

  // Salva le credenziali su file (gitignored) e stampale.
  const creds = [
    '=== k-prevention · credenziali utente predefinito ===',
    `Nome:     ${NAME}`,
    `Email:    ${EMAIL}`,
    `Password: ${password}`,
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
