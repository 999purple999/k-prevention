/** Selettore di workspace: cambia istanza, apre il Consolidato, crea un nuovo workspace
 *  con nome + emoji + colore liberi. */
import { useState, useRef, useEffect } from 'react';
import { useData } from '../lib/data.tsx';
import { DEMO } from '../lib/demo.ts';
import { CONSOLIDATO_ID, WORKSPACE_COLORS, WORKSPACE_EMOJIS } from '../lib/workspaces.ts';

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspace, isConsolidato, switchWorkspace, createWorkspace } = useData();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(WORKSPACE_EMOJIS[1]);
  const [color, setColor] = useState(WORKSPACE_COLORS[1]);
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
      await createWorkspace(name.trim(), emoji, color);
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
        <span className="text-base leading-none">{isConsolidato ? '🗂️' : active?.emoji ?? '👤'}</span>
        <span className="max-w-[9rem] truncate">{label}</span>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="panel absolute left-0 top-11 z-40 w-72 rounded-xl p-1.5 animate-fade-in">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>Workspace</div>
          <div className="max-h-64 overflow-auto">
            {workspaces.map((w) => (
              <button key={w.id} onClick={() => { switchWorkspace(w.id); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--panel-2))]"
                style={activeWorkspace === w.id ? { background: 'rgb(var(--panel-2))' } : undefined}>
                <span className="text-base leading-none">{w.emoji}</span>
                <span className="flex-1 truncate">{w.name}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} />
                {activeWorkspace === w.id && <span style={{ color: 'rgb(var(--accent))' }}>✓</span>}
              </button>
            ))}
          </div>

          {!DEMO && workspaces.length > 1 && (
            <button onClick={() => { switchWorkspace(CONSOLIDATO_ID); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--panel-2))]"
              style={isConsolidato ? { background: 'rgb(var(--accent) / 0.12)' } : undefined}>
              <span className="text-base leading-none">🗂️</span>
              <span className="flex-1">Consolidato <span className="text-[10px]" style={{ color: 'rgb(var(--text-dim))' }}>· tutte insieme</span></span>
              {isConsolidato && <span style={{ color: 'rgb(var(--accent))' }}>✓</span>}
            </button>
          )}

          {!DEMO && (
            <>
              <div className="my-1 h-px" style={{ background: 'rgb(var(--border))' }} />
              {creating ? (
                <div className="space-y-2.5 p-2">
                  <input className="field !py-1.5" placeholder="Nome (es. Fondi, Immobili, Progetto…)" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doCreate()} />
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>Icona</div>
                    <div className="flex flex-wrap gap-1">
                      {WORKSPACE_EMOJIS.map((em) => (
                        <button key={em} onClick={() => setEmoji(em)} className="flex h-7 w-7 items-center justify-center rounded-md text-base transition"
                          style={emoji === em ? { background: 'rgb(var(--accent) / 0.2)', border: '1px solid rgb(var(--accent))' } : { border: '1px solid rgb(var(--border))' }}>{em}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>Colore</div>
                    <div className="flex flex-wrap gap-1.5">
                      {WORKSPACE_COLORS.map((c) => (
                        <button key={c} onClick={() => setColor(c)} className="h-6 w-6 rounded-full transition" style={{ background: c, outline: color === c ? '2px solid rgb(var(--text))' : 'none', outlineOffset: '2px' }} aria-label={c} />
                      ))}
                    </div>
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
