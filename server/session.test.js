/**
 * Test della logica di sessione revocabile sullo store SQLite reale. È la STESSA logica SQL
 * del Worker D1 (createSession/getSession/revoke/expiry), quindi verifica il cuore
 * security-critical: revoca irreversibile, scadenza, isolamento tra utenti.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteStore } from './store/sqlite.js';

const mkUser = async (store, id) =>
  store.createUser({ id, email_lookup: id + '-lk', auth_hash: 'h', auth_salt: 's', kek_salt: 'k', wrapped_dek: 'w', dek_iv: 'iv', created_at: 1 });

// Replica la decisione di requireAuth: valida se esiste, non revocata, non scaduta.
const isValid = (s, userId, now) => !!s && s.user_id === userId && s.revoked_at == null && (s.expires_at == null || s.expires_at >= now);

describe('sessioni revocabili', () => {
  let store;
  beforeEach(async () => {
    store = createSqliteStore(':memory:');
    await mkUser(store, 'U1');
    await mkUser(store, 'U2');
  });

  it('crea e valida una sessione senza scadenza (fino a revoca)', async () => {
    await store.createSession({ id: 'jti1', user_id: 'U1', created_at: 100, expires_at: null, revoked_at: null, device: 'Chrome · Windows', last_seen: 100 });
    const s = await store.getSession('jti1');
    expect(isValid(s, 'U1', 200)).toBe(true);
    expect(s.expires_at).toBeNull();
  });

  it('la revoca è IRREVERSIBILE: nessun metodo la riattiva e il token resta invalido per sempre', async () => {
    await store.createSession({ id: 'jti1', user_id: 'U1', created_at: 100, expires_at: null, revoked_at: null, device: 'x', last_seen: 100 });
    expect(await store.revokeSession('U1', 'jti1', 300)).toBe(true);
    const s1 = await store.getSession('jti1');
    expect(isValid(s1, 'U1', 400)).toBe(false); // rifiutata
    expect(s1.revoked_at).toBe(300);
    // ri-revocare è un no-op (già revocata): non esiste alcun percorso per riattivarla
    expect(await store.revokeSession('U1', 'jti1', 999)).toBe(false);
    const s2 = await store.getSession('jti1');
    expect(s2.revoked_at).toBe(300); // timestamp invariato, resta revocata
    expect(isValid(s2, 'U1', 100000)).toBe(false);
  });

  it('una sessione scaduta è rifiutata', async () => {
    await store.createSession({ id: 'jti1', user_id: 'U1', created_at: 100, expires_at: 500, revoked_at: null, device: 'x', last_seen: 100 });
    const s = await store.getSession('jti1');
    expect(isValid(s, 'U1', 400)).toBe(true); // prima della scadenza
    expect(isValid(s, 'U1', 600)).toBe(false); // dopo la scadenza
  });

  it('isolamento: non si può revocare la sessione di un altro utente', async () => {
    await store.createSession({ id: 'jtiA', user_id: 'U1', created_at: 100, expires_at: null, revoked_at: null, device: 'x', last_seen: 100 });
    expect(await store.revokeSession('U2', 'jtiA', 300)).toBe(false); // U2 non può toccarla
    expect(isValid(await store.getSession('jtiA'), 'U1', 400)).toBe(true); // resta valida
  });

  it('revoca tutte le altre: tiene solo la corrente', async () => {
    for (const id of ['a', 'b', 'c']) await store.createSession({ id, user_id: 'U1', created_at: 100, expires_at: null, revoked_at: null, device: 'x', last_seen: 100 });
    const n = await store.revokeOtherSessions('U1', 'b', 300);
    expect(n).toBe(2);
    expect(isValid(await store.getSession('b'), 'U1', 400)).toBe(true);
    expect(isValid(await store.getSession('a'), 'U1', 400)).toBe(false);
    expect(isValid(await store.getSession('c'), 'U1', 400)).toBe(false);
    expect((await store.listSessions('U1')).length).toBe(3); // restano elencate (storiche), ma revocate
  });

  it('la preferenza di durata si aggiorna e la scadenza sessione si può ri-scrivere', async () => {
    await store.createSession({ id: 'j', user_id: 'U1', created_at: 100, expires_at: 500, revoked_at: null, device: 'x', last_seen: 100 });
    await store.setSessionDuration('U1', 365);
    expect((await store.getUserById('U1')).session_duration_days).toBe(365);
    await store.updateSessionExpiry('j', null); // 'fino a revoca'
    expect((await store.getSession('j')).expires_at).toBeNull();
  });
});
