/** Pannello "Sessioni e dispositivi": preferenza di durata del login + elenco dei dispositivi
 *  con revoca (irreversibile: una volta revocata, quel token non autentica mai più). */
import { useCallback, useEffect, useState } from 'react';
import { api, type DeviceSession } from '../../lib/api.ts';
import { Spinner } from '../ui.tsx';

const DUR_LABEL: Record<number, string> = { 30: '1 mese', 90: '3 mesi', 180: '6 mesi', 365: '1 anno', 0: 'Fino a revoca esplicita' };
const fmtDate = (ms: number) => new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

export function SessionManager() {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [duration, setDuration] = useState<number>(30);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [list, sess] = await Promise.all([api.listSessions(), api.session()]);
      setSessions(list);
      if (typeof sess.sessionDurationDays === 'number') setDuration(sess.sessionDurationDays);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const changeDuration = async (d: number) => {
    setDuration(d); setBusy('duration');
    try { await api.setSessionDuration(d); } finally { setBusy(''); }
  };
  const revoke = async (id: string) => {
    setBusy(id);
    try { await api.revokeSession(id); await refresh(); } finally { setBusy(''); }
  };
  const revokeOthers = async () => {
    setBusy('others');
    try { await api.revokeOtherSessions(); await refresh(); } finally { setBusy(''); }
  };

  const active = sessions.filter((s) => !s.revoked && !s.expired);
  const others = active.filter((s) => !s.current);

  return (
    <div className="space-y-4">
      <div>
        <label className="label mb-1">Durata del login (per questo dispositivo e i prossimi accessi)</label>
        <div className="flex items-center gap-2">
          <select className="field !w-auto" value={duration} onChange={(e) => changeDuration(Number(e.target.value))} disabled={busy === 'duration'}>
            {[30, 90, 180, 365, 0].map((d) => <option key={d} value={d}>{DUR_LABEL[d]}</option>)}
          </select>
          {busy === 'duration' && <Spinner />}
        </div>
        <p className="mt-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          «Fino a revoca esplicita»: la sessione non scade mai da sola — resta valida finché non la revochi qui. La revoca è irreversibile: quel token non potrà mai più autenticare.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Dispositivi connessi ({active.length})</span>
          {others.length > 0 && (
            <button className="btn-ghost !py-1 text-xs" onClick={revokeOthers} disabled={busy === 'others'}>
              {busy === 'others' ? <Spinner /> : null}Revoca tutte le altre
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'rgb(var(--text-dim))' }}><Spinner /> Carico…</div>
        ) : (
          <div className="space-y-2">
            {sessions.length === 0 && <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Nessuna sessione.</p>}
            {sessions.map((s) => {
              const status = s.revoked ? 'revocata' : s.expired ? 'scaduta' : 'attiva';
              const dim = s.revoked || s.expired;
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'rgb(var(--panel-2))', opacity: dim ? 0.55 : 1 }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {s.device ?? 'Dispositivo'}
                      {s.current && <span className="chip !py-0 text-[10px]" style={{ color: 'rgb(var(--accent))', borderColor: 'rgb(var(--accent))' }}>questo dispositivo</span>}
                    </div>
                    <div className="text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>
                      accesso {fmtDate(s.createdAt)} · ultimo uso {fmtDate(s.lastSeen)} · {s.expiresAt ? `scade ${fmtDate(s.expiresAt)}` : 'senza scadenza'} · {status}
                    </div>
                  </div>
                  {!s.revoked && !s.expired && !s.current && (
                    <button className="btn-danger !py-1 text-xs" onClick={() => revoke(s.id)} disabled={busy === s.id}>
                      {busy === s.id ? <Spinner /> : null}Revoca
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
