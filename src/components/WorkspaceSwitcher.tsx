/** Selettore di workspace nell'header: cambia istanza (Personale/Azienda/…), apre la
 *  vista Consolidata, crea un nuovo workspace. */
import { useState, useRef, useEffect } from 'react';
import { useData } from '../lib/data.tsx';
import { DEMO } from '../lib/demo.ts';
import { CONSOLIDATO_ID, KIND_LABEL, type WorkspaceKind } from '../lib/workspaces.ts';

function KindIcon({ kind }: { kind: WorkspaceKind }) {
  if (kind === 'business')
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M6 21V8l6-4 6 4v13M9 21v-4h6v4M9 12h.01M15 12h.01" /></svg>
    );
  if (kind === 'other')
    return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>;
  return <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
}

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, isConsolidato, switchWorkspace, createWorkspace } = useData();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WorkspaceKind>('business');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const active = workspaces.find((w) => w.id === activeWorkspace);
  const label = isConsolidato ? 'Consolidato' : active?.name ?? 'Personale';

  const doCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createWorkspace(name.trim(), kind);
      setName(''); setCreating(false); setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition"
        style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border-strong))' }}
      >
        <span style={{ color: isConsolidato ? 'rgb(var(--accent))' : undefined }}>
          {isConsolidato ? <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg> : <KindIcon kind={active?.kind ?? 'personal'} />}
        </span>
        <span className="max-w-[9rem] truncate">{label}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="panel absolute left-0 top-11 z-40 w-64 rounded-xl p-1.5 animate-fade-in">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>Workspace</div>
          {workspaces.map((w) => (
            <button key={w.id} onClick={() => { switchWorkspace(w.id); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--panel-2))]"
              style={activeWorkspace === w.id ? { background: 'rgb(var(--panel-2))' } : undefined}>
              <KindIcon kind={w.kind} />
              <span className="flex-1 truncate">{w.name}</span>
              <span className="text-[10px]" style={{ color: 'rgb(var(--text-dim))' }}>{KIND_LABEL[w.kind]}</span>
              {activeWorkspace === w.id && <span style={{ color: 'rgb(var(--accent))' }}>✓</span>}
            </button>
          ))}

          {!DEMO && workspaces.length > 1 && (
            <button onClick={() => { switchWorkspace(CONSOLIDATO_ID); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--panel-2))]"
              style={isConsolidato ? { background: 'rgb(var(--accent) / 0.12)' } : undefined}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              <span className="flex-1">Consolidato <span className="text-[10px]" style={{ color: 'rgb(var(--text-dim))' }}>· tutte insieme</span></span>
              {isConsolidato && <span style={{ color: 'rgb(var(--accent))' }}>✓</span>}
            </button>
          )}

          {!DEMO && (
            <>
              <div className="my-1 h-px" style={{ background: 'rgb(var(--border))' }} />
              {creating ? (
                <div className="space-y-2 p-2">
                  <input className="field !py-1.5" placeholder="Nome (es. Azienda Srl)" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doCreate()} />
                  <div className="flex gap-1">
                    {(['personal', 'business', 'other'] as WorkspaceKind[]).map((k) => (
                      <button key={k} onClick={() => setKind(k)} className="flex-1 rounded-lg px-2 py-1 text-xs transition"
                        style={kind === k ? { background: 'rgb(var(--accent))', color: '#04141a' } : { background: 'rgb(var(--panel-2))', color: 'rgb(var(--text-dim))' }}>
                        {KIND_LABEL[k]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={() => setCreating(false)}>Annulla</button>
                    <button className="btn-primary flex-1 !py-1.5 text-xs" disabled={busy || !name.trim()} onClick={doCreate}>Crea</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--panel-2))]" style={{ color: 'rgb(var(--accent))' }}>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                  Nuovo workspace
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
