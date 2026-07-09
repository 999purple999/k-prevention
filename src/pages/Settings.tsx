import { useState } from 'react';
import { useSession } from '../lib/session.tsx';
import { useData } from '../lib/data.tsx';
import { Spinner, EncryptionBadge } from '../components/ui.tsx';

export function Settings() {
  const { changePassword, email } = useSession();
  const { data } = useData();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPw.length < 8) return setMsg({ ok: false, text: 'La nuova password deve avere almeno 8 caratteri.' });
    if (newPw !== confirm) return setMsg({ ok: false, text: 'Le nuove password non coincidono.' });
    setBusy(true);
    try {
      await changePassword(oldPw, newPw);
      setMsg({ ok: true, text: 'Password aggiornata. Nessun dato è stato ri-cifrato: sono cambiati solo 32 byte (la DEK riavvolta con la nuova chiave).' });
      setOldPw(''); setNewPw(''); setConfirm('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Errore durante il cambio password.' });
    } finally {
      setBusy(false);
    }
  }

  function exportData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ _meta: { schemaVersion: '1.0.0', generatedBy: 'k-prevention-export' }, ...data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'k-prevention-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><div className="label mb-1">Nome</div><div className="text-sm">{data?.profile?.name ?? '—'}</div></div>
          <div><div className="label mb-1">Email</div><div className="text-sm">{email ?? '—'}</div></div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Cambia password</h2>
        <p className="mt-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          È il test dell'architettura a due chiavi: la vecchia password scarta la DEK, la nuova la riavvolge. I dati restano identici e non vengono mai ri-cifrati.
        </p>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
          <label><span className="label mb-1">Vecchia password</span><input type="password" className="field" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" required /></label>
          <label><span className="label mb-1">Nuova password</span><input type="password" className="field" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required /></label>
          <label><span className="label mb-1">Conferma</span><input type="password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></label>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button className="btn-primary" disabled={busy}>{busy ? <Spinner /> : null}Aggiorna password</button>
            {msg && <span className="text-xs" style={{ color: msg.ok ? '#6ee7b7' : '#fca5a5' }}>{msg.text}</span>}
          </div>
        </form>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Backup dei dati</h2>
          <button className="btn-ghost" onClick={exportData}>Esporta JSON</button>
        </div>
        <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          Scarica una copia in chiaro dei tuoi dati (resta sul tuo dispositivo). Utile perché la password non è recuperabile: se la dimentichi, i dati cifrati sul server sono definitivamente illeggibili.
        </p>
      </section>

      <section className="panel p-5">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Sicurezza</h2><EncryptionBadge compact /></div>
        <ul className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgb(var(--text-dim))' }}>
          <li>· <strong>Il server è cieco.</strong> Vede solo blob cifrati, la ricerca HMAC dell'email, i timestamp e la dimensione dei blob. Non vede importi, categorie o parametri.</li>
          <li>· <strong>Chiave in memoria.</strong> La chiave di cifratura vive solo in RAM: al refresh della pagina reinserisci la password. È la scelta più sicura (chi inietta JS non può usarla dopo un reload), al costo di dover riautenticarti.</li>
          <li>· <strong>Derivazione.</strong> PBKDF2-SHA256 a 600.000 iterazioni; AES-GCM 256 con IV nuovo a ogni cifratura e Additional Authenticated Data legato a utente+tipo di dato.</li>
        </ul>
      </section>
    </div>
  );
}
