/**
 * Crittografia lato server. Il server non vede mai password né dati in chiaro:
 * qui vivono solo (a) la ricerca deterministica per email, (b) i sali finti
 * anti-enumerazione, (c) il ri-hash dell'authProof, (d) la firma della sessione.
 */
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

function serverSecret() {
  const s = process.env.SERVER_SECRET;
  if (!s || s === 'change-me-to-a-32-byte-base64-secret') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SERVER_SECRET non impostato in produzione. Interrompo: rifiuto di usare un segreto di default.');
    }
    // Dev-only fallback, stabile per la sessione di sviluppo.
    return 'dev-only-insecure-secret-do-not-use-in-prod';
  }
  return s;
}

const secretBytes = () => new TextEncoder().encode(serverSecret());

/**
 * email_lookup = HMAC-SHA256(SERVER_SECRET, lower(email)) → hex, DETERMINISTICO.
 * Deterministico ⇒ interrogabile al login; non invertibile senza il segreto.
 * NON usare un hash con sale casuale: renderebbe la colonna non cercabile.
 */
export function emailLookup(email) {
  return crypto.createHmac('sha256', serverSecret()).update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Sali finti ma deterministici per email sconosciute (stessa forma dei reali: 16 byte
 * → base64). Così POST /api/auth/salts non è un oracolo che rivela chi è iscritto.
 */
export function fakeSalts(email) {
  const e = email.trim().toLowerCase();
  const auth = crypto.createHmac('sha256', serverSecret()).update('auth:' + e).digest().subarray(0, 16);
  const kek = crypto.createHmac('sha256', serverSecret()).update('kek:' + e).digest().subarray(0, 16);
  return { authSalt: auth.toString('base64'), kekSalt: kek.toString('base64') };
}

/**
 * Ri-hash dell'authProof ricevuto dal client, con scrypt + sale casuale server-side.
 * Formato: scrypt$N$r$p$saltB64$hashB64. Un dump del DB non contiene quindi un valore
 * riutilizzabile per autenticarsi (niente pass-the-hash).
 */
export function hashAuthProof(authProof) {
  const N = 16384, r = 8, p = 1, keylen = 32;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(authProof, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Verifica in tempo costante dell'authProof contro il valore memorizzato. */
export function verifyAuthProof(authProof, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(authProof, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Confronto in tempo costante di due stringhe (per l'authProof "dummy" su utenti inesistenti). */
export function constantTimeReject(authProof) {
  // Esegue comunque uno scrypt su un target fittizio: il tempo di risposta per un'email
  // inesistente resta paragonabile a quello di un'email reale.
  const salt = crypto.createHmac('sha256', serverSecret()).update('dummy-salt').digest().subarray(0, 16);
  crypto.scryptSync(authProof, salt, 32, { N: 16384, r: 8, p: 1 });
  return false;
}

const JWT_ALG = 'HS256';
const SESSION_TTL = '30d';

export async function signSession(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretBytes());
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, secretBytes(), { algorithms: [JWT_ALG] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function newId() {
  return crypto.randomUUID();
}
