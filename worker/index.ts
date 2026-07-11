/**
 * k-prevention — Worker Cloudflare (Workers + D1 + Static Assets).
 * Un solo Worker: serve la SPA (asset statici) e le API `/api/*`. Le API sono un
 * passacarte per blob cifrati end-to-end: il server non legge mai i dati in chiaro.
 */
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import { createD1Store } from './store.ts';
import {
  emailLookup,
  fakeSalts,
  hashAuthProof,
  verifyAuthProof,
  constantTimeReject,
  signSession,
  verifySession,
  newId,
} from './crypto.ts';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SERVER_SECRET: string;
  FRANCESCO_PASSWORD?: string;
  FRANCESCO_EMAIL?: string;
}
type Variables = { userId: string };

const BASE_TYPES = ['incomeStreams', 'expenses', 'organicParameters', 'taxModel', 'simulationConfig', 'monteCarlo', 'profile', 'ledger', 'goals'];
const DATA_TYPES = [...BASE_TYPES, 'workspaces'];
const NS_RE = new RegExp(`^w_[a-z0-9]{1,16}_(${BASE_TYPES.join('|')})$`);
// Multi-workspace: tipi base + `workspaces` (indice) + namespaced `w_<id>_<tipo>`.
const isValidType = (t: string) => DATA_TYPES.includes(t) || NS_RE.test(t);
// Un workspace id valido: 'default' o [a-z0-9]{1,16}. Esclude '__all__' (consolidato): gli
// scenari non si creano nella vista consolidata.
const wsIdOr = (v: unknown, fallback = 'default') => (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v) ? v : fallback);

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const COOKIE = 'kp_session';
// Durate ammesse (giorni). 0 = fino a revoca esplicita (nessuna scadenza).
const DURATIONS = new Set([30, 90, 180, 365, 0]);
const normDuration = (d: unknown, fallback: number): number => {
  const n = Number(d);
  return Number.isFinite(n) && DURATIONS.has(n) ? n : fallback;
};
const expiryFor = (days: number, now: number): number | null => (days === 0 ? null : now + days * 86400 * 1000);
const cookieMaxAge = (days: number): number => (days === 0 ? 60 * 60 * 24 * 3650 : days * 86400);
function deviceLabel(ua: string | undefined): string {
  if (!ua) return 'Dispositivo sconosciuto';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Linux/.test(ua) ? 'Linux' : 'Altro';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} · ${os}`;
}

function setSession(c: any, token: string, maxAge: number) {
  const secure = new URL(c.req.url).protocol === 'https:';
  setCookie(c, COOKIE, token, { httpOnly: true, secure, sameSite: 'Strict', path: '/', maxAge });
}

/** Crea una sessione revocabile e imposta il cookie. */
async function startSession(c: any, store: ReturnType<typeof createD1Store>, userId: string, days: number) {
  const now = Date.now();
  const jti = newId();
  const expires = expiryFor(days, now);
  await store.createSession({ id: jti, user_id: userId, created_at: now, expires_at: expires, revoked_at: null, device: deviceLabel(c.req.header('user-agent')), last_seen: now });
  setSession(c, await signSession(c.env.SERVER_SECRET, userId, jti, expires), cookieMaxAge(days));
}

// Middleware di autenticazione: verifica firma + stato della sessione nel DB (revocata/scaduta → 401).
async function requireAuth(c: any, next: any) {
  const token = getCookie(c, COOKIE);
  const v = token ? await verifySession(c.env.SERVER_SECRET, token) : null;
  if (!v) return c.json({ error: 'non autenticato' }, 401);
  const store = createD1Store(c.env.DB);
  const s = await store.getSession(v.jti);
  const now = Date.now();
  if (!s || s.user_id !== v.sub || s.revoked_at != null || (s.expires_at != null && s.expires_at < now)) {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ error: 'sessione non valida o revocata' }, 401);
  }
  c.set('userId', v.sub);
  c.set('sid', v.jti);
  if (now - s.last_seen > 300_000) await store.touchSession(v.jti, now); // throttle scritture last_seen
  await next();
}

app.get('/api/health', (c) => c.json({ ok: true, backend: 'd1' }));

// ---------------- auth ----------------
app.post('/api/auth/register', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { email, authProof, authSalt, kekSalt, wrappedDek, dekIv } = b;
  if (!email || !authProof || !authSalt || !kekSalt || !wrappedDek || !dekIv) return c.json({ error: 'campi mancanti' }, 400);
  const store = createD1Store(c.env.DB);
  const lookup = await emailLookup(c.env.SERVER_SECRET, email);
  if (await store.getUserByEmailLookup(lookup)) return c.json({ error: 'utente già esistente' }, 409);
  const id = newId();
  await store.createUser({
    id,
    email_lookup: lookup,
    auth_hash: await hashAuthProof(c.env.SERVER_SECRET, authProof),
    auth_salt: authSalt,
    kek_salt: kekSalt,
    wrapped_dek: wrappedDek,
    dek_iv: dekIv,
    created_at: Date.now(),
  });
  await startSession(c, store, id, 30);
  return c.json({ userId: id }, 201);
});

app.post('/api/auth/salts', async (c) => {
  const { email } = await c.req.json().catch(() => ({}));
  if (!email) return c.json({ error: 'email mancante' }, 400);
  const store = createD1Store(c.env.DB);
  const user = await store.getUserByEmailLookup(await emailLookup(c.env.SERVER_SECRET, email));
  if (user) return c.json({ authSalt: user.auth_salt, kekSalt: user.kek_salt });
  return c.json(await fakeSalts(c.env.SERVER_SECRET, email));
});

app.post('/api/auth/login', async (c) => {
  const { email, authProof, durationDays } = await c.req.json().catch(() => ({}));
  if (!email || !authProof) return c.json({ error: 'credenziali mancanti' }, 400);
  const store = createD1Store(c.env.DB);
  const user = await store.getUserByEmailLookup(await emailLookup(c.env.SERVER_SECRET, email));
  if (!user) {
    await constantTimeReject(c.env.SERVER_SECRET, authProof);
    return c.json({ error: 'credenziali non valide' }, 401);
  }
  if (!(await verifyAuthProof(c.env.SERVER_SECRET, authProof, user.auth_hash))) return c.json({ error: 'credenziali non valide' }, 401);
  // durata: dal body se valida, altrimenti la preferenza dell'utente, altrimenti 30 giorni.
  const days = normDuration(durationDays, user.session_duration_days ?? 30);
  await startSession(c, store, user.id, days);
  return c.json({ userId: user.id, wrappedDek: user.wrapped_dek, dekIv: user.dek_iv, sessionDurationDays: user.session_duration_days ?? 30 });
});

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, COOKIE);
  const v = token ? await verifySession(c.env.SERVER_SECRET, token) : null;
  if (v) await createD1Store(c.env.DB).revokeSession(v.sub, v.jti, Date.now()); // logout = revoca (irreversibile)
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// -------- gestione sessioni / dispositivi (admin panel dell'utente) --------
app.get('/api/sessions', requireAuth, async (c) => {
  const store = createD1Store(c.env.DB);
  const sid = c.get('sid');
  const now = Date.now();
  const rows = await store.listSessions(c.get('userId'));
  return c.json(
    rows.map((s) => ({
      id: s.id,
      device: s.device,
      createdAt: s.created_at,
      lastSeen: s.last_seen,
      expiresAt: s.expires_at,
      revoked: s.revoked_at != null,
      expired: s.expires_at != null && s.expires_at < now,
      current: s.id === sid,
    })),
  );
});
app.post('/api/sessions/:id/revoke', requireAuth, async (c) => {
  const ok = await createD1Store(c.env.DB).revokeSession(c.get('userId'), c.req.param('id'), Date.now());
  return c.json({ ok });
});
app.post('/api/sessions/revoke-others', requireAuth, async (c) => {
  const n = await createD1Store(c.env.DB).revokeOtherSessions(c.get('userId'), c.get('sid'), Date.now());
  return c.json({ ok: true, revoked: n });
});
// Preferenza di durata (in Impostazioni): aggiorna anche la scadenza della sessione corrente.
app.patch('/api/auth/session-duration', requireAuth, async (c) => {
  const { days } = await c.req.json().catch(() => ({}));
  const d = normDuration(days, -1);
  if (d < 0) return c.json({ error: 'durata non valida' }, 400);
  const store = createD1Store(c.env.DB);
  await store.setSessionDuration(c.get('userId'), d);
  const expires = expiryFor(d, Date.now());
  await store.updateSessionExpiry(c.get('sid'), expires);
  setSession(c, await signSession(c.env.SERVER_SECRET, c.get('userId'), c.get('sid'), expires), cookieMaxAge(d));
  return c.json({ ok: true, days: d });
});

app.get('/api/auth/session', requireAuth, async (c) => {
  const store = createD1Store(c.env.DB);
  const user = await store.getUserById(c.get('userId'));
  if (!user) return c.json({ error: 'sessione non valida' }, 401);
  return c.json({ userId: user.id, wrappedDek: user.wrapped_dek, dekIv: user.dek_iv, sessionDurationDays: user.session_duration_days ?? 30 });
});

app.patch('/api/auth/password', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const { oldAuthProof, newAuthProof, newAuthSalt, newKekSalt, newWrappedDek, newDekIv } = b;
  if (!oldAuthProof || !newAuthProof || !newAuthSalt || !newKekSalt || !newWrappedDek || !newDekIv) return c.json({ error: 'campi mancanti' }, 400);
  const store = createD1Store(c.env.DB);
  const user = await store.getUserById(c.get('userId'));
  if (!user || !(await verifyAuthProof(c.env.SERVER_SECRET, oldAuthProof, user.auth_hash))) return c.json({ error: 'vecchia password non valida' }, 401);
  await store.updateUserAuth(user.id, {
    auth_hash: await hashAuthProof(c.env.SERVER_SECRET, newAuthProof),
    auth_salt: newAuthSalt,
    kek_salt: newKekSalt,
    wrapped_dek: newWrappedDek,
    dek_iv: newDekIv,
  });
  return c.json({ ok: true });
});

// ---------------- dati (passacarte) ----------------
app.get('/api/data', requireAuth, async (c) => c.json(await createD1Store(c.env.DB).getAllData(c.get('userId'))));
app.get('/api/data/versions', requireAuth, async (c) => c.json(await createD1Store(c.env.DB).getDataVersions(c.get('userId'))));

app.get('/api/data/:type', requireAuth, async (c) => {
  const type = c.req.param('type');
  if (!isValidType(type)) return c.json({ error: 'tipo non valido' }, 400);
  const row = await createD1Store(c.env.DB).getData(c.get('userId'), type);
  if (!row) return c.json({ error: 'non trovato' }, 404);
  return c.json(row);
});

app.put('/api/data/:type', requireAuth, async (c) => {
  const type = c.req.param('type');
  if (!isValidType(type)) return c.json({ error: 'tipo non valido' }, 400);
  const { encryptedBlob, iv, baseVersion } = await c.req.json().catch(() => ({}));
  if (typeof encryptedBlob !== 'string' || typeof iv !== 'string') return c.json({ error: 'payload non valido' }, 400);
  const store = createD1Store(c.env.DB);
  if (baseVersion != null) {
    const current = await store.getData(c.get('userId'), type);
    if (current && current.lastModified > baseVersion) return c.json({ error: 'conflitto', current }, 409);
  }
  const ts = Date.now();
  await store.putData(c.get('userId'), type, newId(), encryptedBlob, iv, ts);
  return c.json({ ok: true, lastModified: ts });
});

app.delete('/api/data/:type', requireAuth, async (c) => {
  const type = c.req.param('type');
  if (!isValidType(type)) return c.json({ error: 'tipo non valido' }, 400);
  await createD1Store(c.env.DB).deleteData(c.get('userId'), type);
  return c.json({ ok: true });
});

// ---------------- scenari (stile Git) ----------------
app.post('/api/simulations', requireAuth, async (c) => {
  const { name, encryptedBlob, iv, parentId, isMain, workspaceId } = await c.req.json().catch(() => ({}));
  if (typeof name !== 'string' || typeof encryptedBlob !== 'string' || typeof iv !== 'string') return c.json({ error: 'payload non valido' }, 400);
  const id = newId();
  const now = Date.now();
  await createD1Store(c.env.DB).createSimulation(c.get('userId'), { id, name, workspace_id: wsIdOr(workspaceId), created_at: now, updated_at: now, parent_id: parentId ?? null, is_main: !!isMain, encrypted_blob: encryptedBlob, iv });
  return c.json({ id, createdAt: now }, 201);
});
app.get('/api/simulations', requireAuth, async (c) => c.json(await createD1Store(c.env.DB).listSimulations(c.get('userId'), wsIdOr(c.req.query('workspace')))));
app.get('/api/simulations/:id', requireAuth, async (c) => {
  const sim = await createD1Store(c.env.DB).getSimulation(c.get('userId'), c.req.param('id'));
  if (!sim) return c.json({ error: 'non trovata' }, 404);
  return c.json(sim);
});
app.put('/api/simulations/:id', requireAuth, async (c) => {
  const { name, encryptedBlob, iv } = await c.req.json().catch(() => ({}));
  const now = Date.now();
  const ok = await createD1Store(c.env.DB).updateSimulation(c.get('userId'), c.req.param('id'), { name, encrypted_blob: encryptedBlob, iv, updated_at: now });
  if (!ok) return c.json({ error: 'non trovata' }, 404);
  return c.json({ ok: true, updatedAt: now });
});
app.delete('/api/simulations/:id', requireAuth, async (c) => {
  await createD1Store(c.env.DB).deleteSimulation(c.get('userId'), c.req.param('id'));
  return c.json({ ok: true });
});
app.post('/api/simulations/:id/promote', requireAuth, async (c) => {
  const ok = await createD1Store(c.env.DB).promoteSimulation(c.get('userId'), c.req.param('id'), Date.now());
  if (!ok) return c.json({ error: 'non trovata' }, 404);
  return c.json({ ok: true });
});

// ---------------- sync (SSE self-polling, connessione limitata + reconnect) ----------------
app.get('/api/sync/stream', requireAuth, (c) => {
  const store = createD1Store(c.env.DB);
  const userId = c.get('userId');
  return streamSSE(c, async (stream) => {
    const seen: Record<string, number> = {};
    let simSig = '';
    const snapshot = async () => {
      const vs = await store.getDataVersions(userId);
      const sims = await store.listSimulations(userId);
      return { vs, sig: sims.map((s) => `${s.id}:${s.updatedAt}`).sort().join('|') };
    };
    await stream.writeSSE({ data: 'ready' }).catch(() => {});
    const first = await snapshot();
    for (const v of first.vs) seen[v.dataType] = v.lastModified;
    simSig = first.sig;
    const start = Date.now();
    while (Date.now() - start < 50_000) {
      await stream.sleep(2500);
      let cur;
      try {
        cur = await snapshot();
      } catch {
        continue;
      }
      for (const v of cur.vs) {
        if (!seen[v.dataType] || v.lastModified > seen[v.dataType]) {
          seen[v.dataType] = v.lastModified;
          await stream.writeSSE({ data: JSON.stringify({ type: v.dataType, lastModified: v.lastModified }) });
        }
      }
      if (cur.sig !== simSig) {
        simSig = cur.sig;
        await stream.writeSSE({ data: JSON.stringify({ type: 'simulations', lastModified: Date.now() }) });
      }
    }
  });
});

// NB: il seed di Francesco NON gira nel Worker (la derivazione PBKDF2 a 600k iterazioni
// sfora i limiti CPU del free tier). Si esegue in locale e si inseriscono le righe già
// cifrate in D1: vedi scripts/seed-d1.mjs.

app.all('/api/*', (c) => c.json({ error: 'endpoint non trovato' }, 404));

// Fallback SPA: qualsiasi altra rotta → asset statici (index.html per il client-side routing).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
