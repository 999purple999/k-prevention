/** Rotte di autenticazione. Il server non vede mai la password: riceve un authProof
 *  (derivato client-side) e lo ri-hasha. Vedi serverCrypto.js. */
import { Router } from 'express';
import {
  emailLookup,
  fakeSalts,
  hashAuthProof,
  verifyAuthProof,
  constantTimeReject,
  signSession,
  newId,
} from '../lib/serverCrypto.js';
import { setSessionCookie, clearSessionCookie, requireAuth, rateLimiter, ah, normDuration, expiryFor, cookieMaxAge, deviceLabel } from '../lib/http.js';

export function authRouter(store) {
  const r = Router();
  const auth = requireAuth(store);

  // Crea una sessione revocabile e imposta il cookie.
  async function startSession(req, res, userId, days) {
    const now = Date.now();
    const jti = newId();
    const expires = expiryFor(days, now);
    await store.createSession({ id: jti, user_id: userId, created_at: now, expires_at: expires, revoked_at: null, device: deviceLabel(req.headers['user-agent']), last_seen: now });
    setSessionCookie(res, await signSession(userId, jti, expires), cookieMaxAge(days));
  }

  // POST /api/auth/register — crea l'utente. Il server ri-hasha l'authProof.
  r.post('/register', rateLimiter({ windowMs: 60_000, max: 10 }), ah(async (req, res) => {
    const { email, authProof, authSalt, kekSalt, wrappedDek, dekIv } = req.body || {};
    if (!email || !authProof || !authSalt || !kekSalt || !wrappedDek || !dekIv) {
      return res.status(400).json({ error: 'campi mancanti' });
    }
    const lookup = emailLookup(email);
    if (await store.getUserByEmailLookup(lookup)) {
      return res.status(409).json({ error: 'utente già esistente' });
    }
    const id = newId();
    await store.createUser({
      id,
      email_lookup: lookup,
      auth_hash: hashAuthProof(authProof),
      auth_salt: authSalt,
      kek_salt: kekSalt,
      wrapped_dek: wrappedDek,
      dek_iv: dekIv,
      created_at: Date.now(),
    });
    await startSession(req, res, id, 30);
    res.status(201).json({ userId: id });
  }));

  // POST /api/auth/salts — restituisce i sali. Per email sconosciute: sali FINTI ma
  // deterministici (stessa forma), così l'endpoint non rivela chi è iscritto.
  r.post('/salts', rateLimiter({ windowMs: 60_000, max: 30 }), ah(async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email mancante' });
    const user = await store.getUserByEmailLookup(emailLookup(email));
    if (user) return res.json({ authSalt: user.auth_salt, kekSalt: user.kek_salt });
    return res.json(fakeSalts(email));
  }));

  // POST /api/auth/login — verifica in tempo costante; restituisce wrappedDek + dekIv.
  r.post('/login', rateLimiter({ windowMs: 60_000, max: 20 }), ah(async (req, res) => {
    const { email, authProof, durationDays } = req.body || {};
    if (!email || !authProof) return res.status(400).json({ error: 'credenziali mancanti' });
    const user = await store.getUserByEmailLookup(emailLookup(email));
    if (!user) {
      constantTimeReject(authProof); // pareggia il tempo di risposta
      return res.status(401).json({ error: 'credenziali non valide' });
    }
    if (!verifyAuthProof(authProof, user.auth_hash)) {
      return res.status(401).json({ error: 'credenziali non valide' });
    }
    const days = normDuration(durationDays, user.session_duration_days ?? 30);
    await startSession(req, res, user.id, days);
    res.json({ userId: user.id, wrappedDek: user.wrapped_dek, dekIv: user.dek_iv, sessionDurationDays: user.session_duration_days ?? 30 });
  }));

  // POST /api/auth/logout — logout = revoca (irreversibile).
  r.post('/logout', ah(async (req, res) => {
    const { verifySession } = await import('../lib/serverCrypto.js');
    const { parse } = await import('cookie');
    const token = parse(req.headers.cookie || '')['kp_session'];
    const v = token ? await verifySession(token) : null;
    if (v) await store.revokeSession(v.sub, v.jti, Date.now());
    clearSessionCookie(res);
    res.json({ ok: true });
  }));

  // GET /api/auth/session — stato sessione (per il bootstrap della SPA). Non espone segreti.
  r.get('/session', auth, ah(async (req, res) => {
    const user = await store.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'sessione non valida' });
    res.json({ userId: user.id, wrappedDek: user.wrapped_dek, dekIv: user.dek_iv, sessionDurationDays: user.session_duration_days ?? 30 });
  }));

  // PATCH /api/auth/session-duration — preferenza durata (aggiorna anche la sessione corrente).
  r.patch('/session-duration', auth, ah(async (req, res) => {
    const d = normDuration(req.body?.days, -1);
    if (d < 0) return res.status(400).json({ error: 'durata non valida' });
    await store.setSessionDuration(req.userId, d);
    const expires = expiryFor(d, Date.now());
    await store.updateSessionExpiry(req.sid, expires);
    setSessionCookie(res, await signSession(req.userId, req.sid, expires), cookieMaxAge(d));
    res.json({ ok: true, days: d });
  }));

  // PATCH /api/auth/password — cambio password: NESSUN dato viene ri-cifrato, cambiano 32 byte.
  r.patch('/password', auth, ah(async (req, res) => {
    const { oldAuthProof, newAuthProof, newAuthSalt, newKekSalt, newWrappedDek, newDekIv } = req.body || {};
    if (!oldAuthProof || !newAuthProof || !newAuthSalt || !newKekSalt || !newWrappedDek || !newDekIv) {
      return res.status(400).json({ error: 'campi mancanti' });
    }
    const user = await store.getUserById(req.userId);
    if (!user || !verifyAuthProof(oldAuthProof, user.auth_hash)) {
      return res.status(401).json({ error: 'vecchia password non valida' });
    }
    await store.updateUserAuth(user.id, {
      auth_hash: hashAuthProof(newAuthProof),
      auth_salt: newAuthSalt,
      kek_salt: newKekSalt,
      wrapped_dek: newWrappedDek,
      dek_iv: newDekIv,
    });
    res.json({ ok: true });
  }));

  return r;
}
