/**
 * Crittografia lato server per Cloudflare Workers (solo Web Crypto + jose, niente Node).
 * Ruoli: ricerca deterministica per email, sali finti anti-enumerazione, ri-hash
 * dell'authProof, firma della sessione. Il server non vede mai password né dati in chiaro.
 */
import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function hmac(secret: string, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, encoder.encode(msg));
}

/** email_lookup = HMAC-SHA256(SERVER_SECRET, lower(email)) → hex. Deterministico, cercabile. */
export async function emailLookup(secret: string, email: string): Promise<string> {
  return toHex(await hmac(secret, email.trim().toLowerCase()));
}

/** Sali finti ma deterministici (16 byte → base64) per email sconosciute: niente oracolo. */
export async function fakeSalts(secret: string, email: string): Promise<{ authSalt: string; kekSalt: string }> {
  const e = email.trim().toLowerCase();
  const auth = new Uint8Array(await hmac(secret, 'auth:' + e)).subarray(0, 16);
  const kek = new Uint8Array(await hmac(secret, 'kek:' + e)).subarray(0, 16);
  return { authSalt: toB64(auth), kekSalt: toB64(kek) };
}

/**
 * Ri-hash dell'authProof: HMAC-SHA256(SERVER_SECRET, "authproof:" + authProof) → hex.
 * L'authProof è già l'output di PBKDF2 a 600k iterazioni lato client (alta entropia): un
 * HMAC con chiave server-side basta a impedire il pass-the-hash da un dump del DB, senza
 * il costo CPU di un secondo PBKDF2 (rilevante nei limiti dei Workers).
 */
export async function hashAuthProof(secret: string, authProof: string): Promise<string> {
  return toHex(await hmac(secret, 'authproof:' + authProof));
}

/** Confronto in tempo costante di due stringhe esadecimali. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyAuthProof(secret: string, authProof: string, stored: string): Promise<boolean> {
  return timingSafeEqualHex(await hashAuthProof(secret, authProof), stored);
}

/** Pareggia il tempo di risposta per email inesistenti (calcolo comunque un HMAC). */
export async function constantTimeReject(secret: string, authProof: string): Promise<false> {
  await hashAuthProof(secret, authProof);
  return false;
}

const JWT_ALG = 'HS256';
/**
 * Firma un JWT di sessione con un `jti` (id sessione) e una scadenza opzionale.
 * expiresAtMs = null → nessuna scadenza nel token (solo il DB può revocarla/scaderla).
 */
export async function signSession(secret: string, userId: string, jti: string, expiresAtMs: number | null): Promise<string> {
  let b = new SignJWT({ sub: userId, jti }).setProtectedHeader({ alg: JWT_ALG }).setIssuedAt();
  if (expiresAtMs != null) b = b.setExpirationTime(Math.floor(expiresAtMs / 1000));
  return b.sign(encoder.encode(secret));
}

/** Verifica firma + scadenza del token. Ritorna { sub, jti } oppure null. La revoca
 *  (stato lato server) è controllata a parte in requireAuth. */
export async function verifySession(secret: string, token: string): Promise<{ sub: string; jti: string } | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: [JWT_ALG] });
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
    return { sub: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
