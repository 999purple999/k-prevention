/**
 * Logica di seed dell'utente predefinito, riutilizzabile:
 *  - dalla CLI (`server/seed.js`) — createOnly=false, aggiorna se esiste;
 *  - all'avvio del server su Cloud Run (SEED_ON_START=1) — createOnly=true, NON sovrascrive
 *    un utente esistente (così un cold start non cancella le modifiche dell'utente).
 *
 * Girando nello stesso processo del server, usa lo STESSO SERVER_SECRET (nessun mismatch
 * di email_lookup) e, su Cloud Run, le Application Default Credentials del service account
 * (nessun bisogno di `gcloud auth application-default login` in locale).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { dirname, join } from 'node:path';
import { emailLookup, hashAuthProof, newId } from './serverCrypto.js';
import { deriveAuthProof, deriveKEK, generateDEK, wrapDEK, encryptData, randomSaltB64, aadFor } from '../../src/lib/crypto.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_EMAIL = 'francesco.pernice@k-prevention.app';
const NAME = 'Francesco Pernice';

const U = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const L = 'abcdefghijkmnpqrstuvwxyz';
const D = '23456789';
const S = '!@#$%&*?-+';

export function generatePassword() {
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  const raw = pick(U, 3) + pick(L, 5) + pick(D, 4) + pick(S, 2) + pick(L, 4) + pick(U, 2) + pick(D, 2) + pick(S, 1);
  const arr = raw.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

export async function seedFrancesco(store, { password, email = DEFAULT_EMAIL, createOnly = false } = {}) {
  const pw = password || generatePassword();
  const lookup = emailLookup(email);
  const existing = await store.getUserByEmailLookup(lookup);

  if (existing && createOnly) {
    return { created: false, skipped: true, userId: existing.id, email, password: null };
  }

  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'francesco_dataset.json'), 'utf8'));

  const authSalt = randomSaltB64();
  const kekSalt = randomSaltB64();
  const authProof = await deriveAuthProof(pw, authSalt);
  const kek = await deriveKEK(pw, kekSalt);
  const dek = await generateDEK();
  const { wrappedDek, iv: dekIv } = await wrapDEK(dek, kek);

  const userId = existing ? existing.id : newId();
  const authRow = { auth_hash: hashAuthProof(authProof), auth_salt: authSalt, kek_salt: kekSalt, wrapped_dek: wrappedDek, dek_iv: dekIv };
  if (existing) {
    await store.updateUserAuth(userId, authRow);
  } else {
    await store.createUser({ id: userId, email_lookup: lookup, ...authRow, created_at: Date.now() });
  }

  const blobs = {
    profile: { name: NAME, email },
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

  return { created: !existing, skipped: false, userId, email, password: pw, blobCount: Object.keys(blobs).length };
}
