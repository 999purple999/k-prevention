/**
 * Seed di Francesco su D1 SENZA far girare PBKDF2 nel Worker (che sfora i limiti CPU del
 * free tier). Qui la derivazione pesante gira in locale (Node), poi si inseriscono le righe
 * già cifrate in D1 via `wrangler d1 execute`. L'E2E resta intatto: i blob sono cifrati con
 * la chiave derivata dalla password; il server vede solo opaco.
 *
 * Uso:
 *   SERVER_SECRET=... FRANCESCO_PASSWORD=... node scripts/seed-d1.mjs --out <file.sql> [--email x]
 * Poi:
 *   wrangler d1 execute k-prevention-db --remote --file <file.sql>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { deriveAuthProof, deriveKEK, generateDEK, wrapDEK, encryptData, randomSaltB64, aadFor } from '../src/lib/crypto.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : join(ROOT, 'seed-d1.sql');
const emailIdx = args.indexOf('--email');
const EMAIL = (emailIdx >= 0 ? args[emailIdx + 1] : process.env.FRANCESCO_EMAIL) || 'francesco.pernice@k-prevention.app';
const NAME = 'Francesco Pernice';

const SECRET = process.env.SERVER_SECRET;
const PASSWORD = process.env.FRANCESCO_PASSWORD;
if (!SECRET || !PASSWORD) {
  console.error('Servono SERVER_SECRET e FRANCESCO_PASSWORD nell\'ambiente.');
  process.exit(1);
}

// Devono combaciare ESATTAMENTE con worker/crypto.ts (HMAC-SHA256, stessi messaggi).
const hmacHex = (msg) => crypto.createHmac('sha256', SECRET).update(msg).digest('hex');
const emailLookup = (email) => hmacHex(email.trim().toLowerCase());
const hashAuthProof = (authProof) => hmacHex('authproof:' + authProof);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function main() {
  const dataset = JSON.parse(readFileSync(join(ROOT, 'data', 'francesco_dataset.json'), 'utf8'));

  const authSalt = randomSaltB64();
  const kekSalt = randomSaltB64();
  const authProof = await deriveAuthProof(PASSWORD, authSalt);
  const kek = await deriveKEK(PASSWORD, kekSalt);
  const dek = await generateDEK();
  const { wrappedDek, iv: dekIv } = await wrapDEK(dek, kek);

  const userId = crypto.randomUUID();
  const lookup = emailLookup(EMAIL);
  const authHash = hashAuthProof(authProof);
  const now = Date.now();

  const blobs = {
    profile: { name: NAME, email: EMAIL },
    incomeStreams: dataset.incomeStreams,
    expenses: dataset.expenses,
    organicParameters: dataset.organicParameters,
    taxModel: { ...dataset.taxModel, _unverified: dataset._unverified ?? [] },
    simulationConfig: dataset.simulationConfig,
    monteCarlo: dataset.monteCarlo,
  };

  const lines = [];
  // Idempotente: rimuovi eventuale Francesco preesistente, poi reinserisci.
  lines.push(`DELETE FROM user_data WHERE user_id IN (SELECT id FROM users WHERE email_lookup = ${q(lookup)});`);
  lines.push(`DELETE FROM simulations WHERE user_id IN (SELECT id FROM users WHERE email_lookup = ${q(lookup)});`);
  lines.push(`DELETE FROM users WHERE email_lookup = ${q(lookup)};`);
  lines.push(
    `INSERT INTO users (id, email_lookup, auth_hash, auth_salt, kek_salt, wrapped_dek, dek_iv, created_at) VALUES (${q(userId)}, ${q(lookup)}, ${q(authHash)}, ${q(authSalt)}, ${q(kekSalt)}, ${q(wrappedDek)}, ${q(dekIv)}, ${now});`,
  );
  for (const [type, obj] of Object.entries(blobs)) {
    const { ciphertext, iv } = await encryptData(obj, dek, aadFor(userId, type));
    lines.push(
      `INSERT INTO user_data (id, user_id, data_type, encrypted_blob, iv, last_modified) VALUES (${q(crypto.randomUUID())}, ${q(userId)}, ${q(type)}, ${q(ciphertext)}, ${q(iv)}, ${now});`,
    );
  }

  writeFileSync(OUT, lines.join('\n') + '\n');
  console.log(`✓ SQL di seed scritto in ${OUT} (${Object.keys(blobs).length} blob, userId ${userId}).`);
}

main().catch((e) => {
  console.error('Seed fallito:', e);
  process.exit(1);
});
