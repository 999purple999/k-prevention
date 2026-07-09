import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../lib/data.tsx';
import { detectAndPreview, mergeGear, type ImportPreview } from '../lib/importer.ts';
import { fmtEUR } from '../lib/format.ts';
import { Spinner } from '../components/ui.tsx';

export function ImportPage() {
  const { data, save } = useData();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPreview(detectAndPreview(JSON.parse(String(reader.result))));
      } catch {
        setPreview({ kind: 'error', message: 'Il file non è JSON valido.' });
      }
    };
    reader.readAsText(file);
  }, []);

  async function confirmImport() {
    if (!preview || preview.kind === 'error' || !data) return;
    setBusy(true);
    try {
      if (preview.kind === 'gear') {
        await save('expenses', mergeGear(data.expenses, preview.toAdd));
      } else {
        for (const [k, v] of Object.entries(preview.data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await save(k as any, v as any);
        }
      }
      navigate('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importa dati</h1>
        <p className="mt-1 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
          Carica un modello completo (JSON con <code>_meta.schemaVersion</code>) o una lista di spese studio (output della ricerca gear). Prima di applicare vedrai sempre un'anteprima.
        </p>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        className="panel flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed py-12 text-center transition"
        style={{ borderColor: drag ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))', background: drag ? 'rgb(var(--accent)/.06)' : undefined }}
      >
        <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8"><path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="text-sm font-medium">{fileName || 'Trascina qui il JSON o clicca per scegliere'}</div>
        <div className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>gear_final.json · un modello esportato · schema 1.x</div>
      </label>

      {preview?.kind === 'error' && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgb(239 68 68 / 0.12)', border: '1px solid rgb(239 68 68 / 0.3)', color: '#fca5a5' }}>{preview.message}</div>
      )}

      {preview?.kind === 'gear' && (
        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Anteprima — spese studio</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <Stat n={preview.toAdd.length} l="voci" />
            <Stat n={preview.unverifiedCount} l="da verificare" warn />
            <Stat v={fmtEUR(preview.totalVerified)} l="totale verificato" />
          </div>
          {preview.conflicts.length > 0 && (
            <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'rgb(245 158 11 / 0.10)', border: '1px solid rgb(245 158 11 / 0.28)', color: '#fbbf24' }}>
              <div className="mb-1 font-semibold">Conflitti tra fonti risolti:</div>
              <ul className="space-y-0.5">{preview.conflicts.map((c, i) => <li key={i}>· {c.id} ({c.field}): {c.resolution}</li>)}</ul>
            </div>
          )}
          <div className="mt-3 max-h-64 space-y-1 overflow-auto pr-1">
            {preview.toAdd.map((e) => {
              const unv = (e as { unverifiedPrice?: boolean }).unverifiedPrice;
              return (
                <div key={e.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgb(var(--bg)/.4)' }}>
                  <span className="flex items-center gap-2 truncate">{e.name}{unv && <span className="chip !py-0 text-[10px]" style={{ color: '#fbbf24' }}>da verificare</span>}</span>
                  <span className="tnum text-xs" style={{ color: 'rgb(var(--text-dim))' }}>{unv ? '—' : fmtEUR((e.amount as { value: number }).value)}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Le voci saranno aggiunte alle tue spese esistenti (le voci con lo stesso id vengono sovrascritte). Le voci senza prezzo verificato entrano disabilitate.</p>
        </div>
      )}

      {preview?.kind === 'full' && (
        <div className="panel p-5">
          <h2 className="text-sm font-semibold">Anteprima — modello completo</h2>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Questo import SOVRASCRIVE le sezioni presenti nel file.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
            <Stat n={preview.incomeCount} l="redditi" />
            <Stat n={preview.expenseCount} l="spese" />
            <Stat v={preview.hasOrganic ? 'sì' : '—'} l="parametri organici" />
            <Stat v={preview.hasTax ? 'sì' : '—'} l="modello fiscale" />
          </div>
        </div>
      )}

      {preview && preview.kind !== 'error' && (
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => { setPreview(null); setFileName(''); }}>Annulla</button>
          <button className="btn-primary" disabled={busy} onClick={confirmImport}>{busy ? <Spinner /> : null}Conferma import</button>
        </div>
      )}
    </div>
  );
}

function Stat({ n, v, l, warn }: { n?: number; v?: string; l: string; warn?: boolean }) {
  return (
    <div className="panel-flat p-3">
      <div className="text-xl font-semibold tnum" style={warn && (n ?? 0) > 0 ? { color: '#fbbf24' } : undefined}>{v ?? n}</div>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>{l}</div>
    </div>
  );
}
