/** Gestione dei workspace in Impostazioni: rinomina, cambia emoji/colore, elimina. */
import { useState } from 'react';
import { useData } from '../../lib/data.tsx';
import { WORKSPACE_COLORS, WORKSPACE_EMOJIS } from '../../lib/workspaces.ts';

export function WorkspaceManager() {
  const { workspaces, renameWorkspace, deleteWorkspace } = useData();
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {workspaces.map((w) => (
        <div key={w.id} className="panel-flat p-3">
          <div className="flex items-center gap-3">
            <span className="text-xl leading-none">{w.emoji}</span>
            <input
              className="field flex-1 !py-1.5"
              value={w.name}
              onChange={(e) => renameWorkspace(w.id, { name: e.target.value })}
            />
            {w.id !== 'default' &&
              (confirmDel === w.id ? (
                <div className="flex gap-1">
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => setConfirmDel(null)}>Annulla</button>
                  <button className="btn-danger !py-1.5 text-xs" onClick={() => { deleteWorkspace(w.id); setConfirmDel(null); }}>Elimina davvero</button>
                </div>
              ) : (
                <button className="btn-danger h-8 !px-2 text-xs" title="Elimina workspace" onClick={() => setConfirmDel(w.id)}>🗑</button>
              ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1">
              {WORKSPACE_EMOJIS.slice(0, 10).map((em) => (
                <button key={em} onClick={() => renameWorkspace(w.id, { emoji: em })} className="flex h-6 w-6 items-center justify-center rounded text-sm transition"
                  style={w.emoji === em ? { background: 'rgb(var(--accent) / 0.2)' } : undefined}>{em}</button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              {WORKSPACE_COLORS.map((c) => (
                <button key={c} onClick={() => renameWorkspace(w.id, { color: c })} className="h-5 w-5 rounded-full transition"
                  style={{ background: c, outline: w.color === c ? '2px solid rgb(var(--text))' : 'none', outlineOffset: '2px' }} aria-label={c} />
              ))}
            </div>
          </div>
          {w.id === 'default' && (
            <p className="mt-1.5 text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>Il workspace principale non può essere eliminato.</p>
          )}
        </div>
      ))}
    </div>
  );
}
