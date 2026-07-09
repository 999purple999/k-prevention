/**
 * k-prevention — crittografia client-side a due chiavi (KEK/DEK).
 *
 * Principio (Fase 1, Passo 4): il server NON vede mai la password né i dati in chiaro.
 * Dalla password si derivano DUE segreti indipendenti, con SALI DIVERSI:
 *   - authProof: ciò che il client manda al server come "password". Il server lo
 *     ri-hasha con un sale server-side prima di salvarlo. Non è la chiave dei dati.
 *   - KEK (Key-Encryption-Key): resta SOLO nel browser (non estraibile). Avvolge la DEK.
 * I dati sono cifrati con una DEK casuale, avvolta dalla KEK. Cambiare password
 * significa ri-avvolgere 32 byte, non ri-cifrare l'intero database.
 *
 * Il modulo è isomorfo: usa solo Web Crypto (`crypto.subtle`), disponibile sia nel
 * browser sia in Node ≥ 20. È quindi importato tanto dalla SPA quanto dallo script
 * di seed lato server, così che i byte prodotti dai due lati coincidano esattamente.
 */

const subtle = globalThis.crypto.subtle;

/** Iterazioni PBKDF2. 600k è la soglia OWASP per PBKDF2-SHA256. Argon2 sarebbe
 *  preferibile ma non è esposto dalla Web Crypto API: vedi README. */
export const PBKDF2_ITERATIONS = 600_000;

// ---------------------------------------------------------------------------
// Helper di codifica (isomorfi browser/Node)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Restituisce un ArrayBuffer "puro" da una Uint8Array. Serve solo a soddisfare la
 * tipizzazione stringente di BufferSource in TS 5.7 (a runtime è indifferente);
 * ArrayBuffer non è generico e soddisfa tutti gli overload di crypto.subtle.
 */
function ab(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Sale/nonce casuale, restituito in base64. */
export function randomSaltB64(bytes = 16): string {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return bytesToBase64(b);
}

function randomIv(): Uint8Array {
  // IV a 96 bit, casuale, NUOVO A OGNI CIFRATURA (obbligatorio per AES-GCM).
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  return iv;
}

// ---------------------------------------------------------------------------
// Derivazione delle chiavi dalla password
// ---------------------------------------------------------------------------

async function importPasswordKey(password: string): Promise<CryptoKey> {
  return subtle.importKey('raw', ab(enc.encode(password)), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
}

/**
 * authProof = PBKDF2-SHA256(password, authSalt, 600k) → 32 byte → base64.
 * È ciò che il client invia al server. Il server lo ri-hasha prima di salvarlo,
 * così un dump del DB non contiene un valore direttamente utilizzabile per il login.
 */
export async function deriveAuthProof(password: string, authSaltB64: string): Promise<string> {
  const keyMaterial = await importPasswordKey(password);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: ab(base64ToBytes(authSaltB64)), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/**
 * KEK = PBKDF2-SHA256(password, kekSalt, 600k) → CryptoKey AES-GCM 256, NON estraibile.
 * kekSalt DEVE essere diverso da authSalt: se fossero uguali, il server (che riceve
 * l'authProof) potrebbe tentare di derivare la KEK.
 */
export async function deriveKEK(password: string, kekSaltB64: string): Promise<CryptoKey> {
  const keyMaterial = await importPasswordKey(password);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: ab(base64ToBytes(kekSaltB64)), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, // non estraibile: la KEK non lascia mai il browser
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// DEK: chiave casuale che cifra davvero i dati
// ---------------------------------------------------------------------------

/** DEK casuale AES-GCM 256, estraibile (serve per avvolgerla con la KEK). */
export async function generateDEK(): Promise<CryptoKey> {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export interface Wrapped {
  wrappedDek: string; // base64
  iv: string; // base64
}

/** Avvolge (cifra) la DEK con la KEK. Restituisce blob + iv in base64. */
export async function wrapDEK(dek: CryptoKey, kek: CryptoKey): Promise<Wrapped> {
  const iv = randomIv();
  const wrapped = await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv: ab(iv) });
  return { wrappedDek: bytesToBase64(new Uint8Array(wrapped)), iv: bytesToBase64(iv) };
}

/** Scarta (decifra) la DEK con la KEK. La DEK risultante è NON estraibile. */
export async function unwrapDEK(wrappedDekB64: string, ivB64: string, kek: CryptoKey): Promise<CryptoKey> {
  return subtle.unwrapKey(
    'raw',
    ab(base64ToBytes(wrappedDekB64)),
    kek,
    { name: 'AES-GCM', iv: ab(base64ToBytes(ivB64)) },
    { name: 'AES-GCM', length: 256 },
    false, // la DEK vive in memoria come chiave opaca, non estraibile
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Cifratura dei dati (con Additional Authenticated Data)
// ---------------------------------------------------------------------------

export interface Encrypted {
  ciphertext: string; // base64
  iv: string; // base64
}

/**
 * aad = `${userId}:${dataType}`, sempre. Senza AAD un attaccante con accesso al DB
 * potrebbe scambiare il blob di un utente/tipo con quello di un altro: AES-GCM
 * decifrerebbe senza protestare. Con l'AAD legato a userId+dataType, il tag GCM fallisce.
 */
export async function encryptData(obj: unknown, dek: CryptoKey, aad: string): Promise<Encrypted> {
  const iv = randomIv();
  const plaintext = enc.encode(JSON.stringify(obj));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv: ab(iv), additionalData: ab(enc.encode(aad)) }, dek, ab(plaintext));
  return { ciphertext: bytesToBase64(new Uint8Array(ct)), iv: bytesToBase64(iv) };
}

export async function decryptData<T = unknown>(ciphertextB64: string, ivB64: string, dek: CryptoKey, aad: string): Promise<T> {
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: ab(base64ToBytes(ivB64)), additionalData: ab(enc.encode(aad)) },
    dek,
    ab(base64ToBytes(ciphertextB64)),
  );
  return JSON.parse(dec.decode(pt)) as T;
}

/** AAD canonico per un blob di dati utente. */
export function aadFor(userId: string, dataType: string): string {
  return `${userId}:${dataType}`;
}
