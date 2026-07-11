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

export function setSessionCookie(res, token, maxAge = 60 * 60 * 24 * 30) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, token, { httpOnly: true, secure: isProd(), sameSite: 'strict', path: '/', maxAge }),
  );
}

// Durate ammesse (giorni). 0 = fino a revoca esplicita.
const DURATIONS = new Set([30, 90, 180, 365, 0]);
export const normDuration = (d, fallback) => {
  const n = Number(d);
  return Number.isFinite(n) && DURATIONS.has(n) ? n : fallback;
};
export const expiryFor = (days, now) => (days === 0 ? null : now + days * 86400 * 1000);
export const cookieMaxAge = (days) => (days === 0 ? 60 * 60 * 24 * 3650 : days * 86400);
export function deviceLabel(ua) {
  if (!ua) return 'Dispositivo sconosciuto';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Altro';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, '', { httpOnly: true, secure: isProd(), sameSite: 'strict', path: '/', maxAge: 0 }),
  );
}

/** Middleware: richiede una sessione valida; popola req.userId. Il JWT vive solo nel
 *  cookie httpOnly, mai in localStorage. */
export function requireAuth(store) {
  return async (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies[COOKIE_NAME];
    const v = token ? await verifySession(token) : null;
    if (!v) return res.status(401).json({ error: 'non autenticato' });
    // Verifica lo stato della sessione nel DB: revocata/scaduta → 401 (mirror del Worker).
    if (store) {
      const s = await store.getSession(v.jti);
      const now = Date.now();
      if (!s || s.user_id !== v.sub || s.revoked_at != null || (s.expires_at != null && s.expires_at < now)) {
        clearSessionCookie(res);
        return res.status(401).json({ error: 'sessione non valida o revocata' });
      }
      if (now - s.last_seen > 300_000) await store.touchSession(v.jti, now);
      req.sid = v.jti;
    }
    req.userId = v.sub;
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
