/** Barra dei preset: applica un bundle di parametri con un click. Non tocca redditi/spese. */
import { useState } from 'react';
import { useData } from '../lib/data.tsx';
import { PRESETS, PRESET_GROUPS, type Preset, type PresetPatch } from '../lib/presets.ts';
import { Help } from './ui.tsx';

export function PresetBar() {
  const { data, save } = useData();
  const [applied, setApplied] = useState<string | null>(null);
  if (!data) return null;

  const applyPreset = (p: Preset) => {
    const patch: PresetPatch = p.apply(data);
    (Object.keys(patch) as (keyof PresetPatch)[]).forEach((k) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      save(k as any, (patch as any)[k]);
    });
    setApplied(p.id);
    window.setTimeout(() => setApplied((a) => (a === p.id ? null : a)), 2200);
  };

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold">Preset rapidi</h2>
        <Help text="Applicano un insieme di assunzioni (rischio, fisco, precisione) con un click. Cambiano solo il modello, non i tuoi redditi e le tue spese." />
        {applied && (
          <span className="chip animate-fade-in" style={{ color: '#6ee7b7', borderColor: 'rgb(16 185 129 / 0.4)' }}>
            ✓ {PRESETS.find((p) => p.id === applied)?.name} applicato
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        {PRESET_GROUPS.map((g) => (
          <div key={g.id} className="min-w-0">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>{g.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.filter((p) => p.group === g.id).map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p)}
                  title={p.description}
                  className="group relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
                  style={{ background: applied === p.id ? 'rgb(var(--accent) / 0.16)' : 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border-strong))' }}
                >
                  <span aria-hidden>{p.emoji}</span>
                  {p.name}
                  <span className="panel invisible absolute left-0 top-9 z-30 w-64 rounded-lg p-3 text-left text-xs font-normal normal-case opacity-0 transition group-hover:visible group-hover:opacity-100" style={{ color: 'rgb(var(--text-dim))' }}>
                    {p.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
