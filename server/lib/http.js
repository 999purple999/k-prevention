/** Helper HTTP: cookie di sessione, middleware di autenticazione, rate limiter. */
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { verifySession } from './serverCrypto.js';

/**
 * Wrapper per handler async: Express 4 NON inoltra le promise rifiutate a next(), quindi
 * un errore dello store lascerebbe la richiesta appesa. Questo lo cattura e lo passa
 * all'error middleware. (In Express 5 non servirebbe.)
 */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const COOKIE_NAME = 'kp_session';
const isProd = () => process.env.NODE_ENV === 'production';

export function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 giorni
    }),
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, '', { httpOnly: true, secure: isProd(), sameSite: 'strict', path: '/', maxAge: 0 }),
  );
}

/** Middleware: richiede una sessione valida; popola req.userId. Il JWT vive solo nel
 *  cookie httpOnly, mai in localStorage. */
export function requireAuth() {
  return async (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    const userId = token ? await verifySession(token) : null;
    if (!userId) return res.status(401).json({ error: 'non autenticato' });
    req.userId = userId;
    next();
  };
}

/**
 * Rate limiter in-memory (finestra scorrevole per chiave). Adeguato a una singola
 * istanza; su Cloud Run multi-istanza va sostituito da un contatore condiviso
 * (Firestore/Redis). Documentato nel README come limite noto.
 */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    // req.ip è normalizzato da Express con `trust proxy` attivo (vedi app.js). Non è a prova
    // di spoofing su multi-istanza — il limiter resta best-effort, come documentato nel README.
    const key = (req.ip || req.socket.remoteAddress || 'unknown') + ':' + req.path;
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (arr.length > max) return res.status(429).json({ error: 'troppe richieste, riprova tra poco' });
    next();
  };
}
