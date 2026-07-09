import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Deve essere impostato PRIMA che serverCrypto legga l'ambiente (lo legge a ogni chiamata).
process.env.SERVER_SECRET = 'test-secret-abcdefghijklmnopqrstuvwxyz012345';
process.env.NODE_ENV = 'test';

const { createMemoryStore } = await import('./store/index.js');
const { createApp } = await import('./app.js');
const crypto = await import('../src/lib/crypto.ts');

let store, server, base;

beforeAll(async () => {
  store = await createMemoryStore();
  const app = createApp(store, { serveSpa: false });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await store.close();
});

function cookieFrom(res) {
  const set = res.headers.getSetCookie?.() || [];
  return set.map((c) => c.split(';')[0]).join('; ');
}

async function registerUser(email, password) {
  const authSalt = crypto.randomSaltB64();
  const kekSalt = crypto.randomSaltB64();
  const authProof = await crypto.deriveAuthProof(password, authSalt);
  const kek = await crypto.deriveKEK(password, kekSalt);
  const dek = await crypto.generateDEK();
  const { wrappedDek, iv: dekIv } = await crypto.wrapDEK(dek, kek);
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, authProof, authSalt, kekSalt, wrappedDek, dekIv }),
  });
  const body = await res.json();
  return { res, cookie: cookieFrom(res), userId: body.userId, dek };
}

describe('auth + server blindness (Fase 1, Passo 8)', () => {
  it('auth.saltOracle: /salts con email inesistente restituisce 200 e sali della stessa forma', async () => {
    await registerUser('reale@esempio.it', 'password-robusta-123!');

    const real = await fetch(`${base}/api/auth/salts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'reale@esempio.it' }),
    });
    const unknown = await fetch(`${base}/api/auth/salts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'inesistente@esempio.it' }),
    });

    expect(real.status).toBe(200);
    expect(unknown.status).toBe(200);
    const rb = await real.json();
    const ub = await unknown.json();
    for (const b of [rb, ub]) {
      expect(typeof b.authSalt).toBe('string');
      expect(typeof b.kekSalt).toBe('string');
    }
    // Stessa forma (lunghezza base64) → nessun oracolo di enumerazione.
    expect(ub.authSalt.length).toBe(rb.authSalt.length);
    expect(ub.kekSalt.length).toBe(rb.kekSalt.length);
    // Deterministici: due chiamate per la stessa email sconosciuta coincidono.
    const unknown2 = await (
      await fetch(`${base}/api/auth/salts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'inesistente@esempio.it' }),
      })
    ).json();
    expect(unknown2.authSalt).toBe(ub.authSalt);
  });

  it('server.blindness: la stringa SEGRETO_CANARINO_42 NON compare in nessuna colonna del DB', async () => {
    const { cookie, userId, dek } = await registerUser('canary@esempio.it', 'password-robusta-456!');

    // Cifra un blob che contiene il canarino e salvalo via l'endpoint passacarte.
    const aad = crypto.aadFor(userId, 'expenses');
    const { ciphertext, iv } = await crypto.encryptData(
      { note: 'SEGRETO_CANARINO_42', importo: 15000 },
      dek,
      aad,
    );
    const put = await fetch(`${base}/api/data/expenses`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ encryptedBlob: ciphertext, iv }),
    });
    expect(put.status).toBe(200);

    // Il server ha davvero salvato qualcosa...
    const get = await fetch(`${base}/api/data/expenses`, { headers: { cookie } });
    expect(get.status).toBe(200);
    const stored = await get.json();
    expect(typeof stored.encryptedBlob).toBe('string');
    expect(stored.encryptedBlob.length).toBeGreaterThan(10);

    // ...ma in nessuna colonna di nessuna tabella compare il canarino in chiaro.
    const hits = await store.scanForPlaintext('SEGRETO_CANARINO_42');
    expect(hits).toEqual([]);

    // E il blob decifra correttamente solo con la DEK giusta e l'AAD giusto.
    const back = await crypto.decryptData(stored.encryptedBlob, stored.iv, dek, aad);
    expect(back.note).toBe('SEGRETO_CANARINO_42');
  });
});
