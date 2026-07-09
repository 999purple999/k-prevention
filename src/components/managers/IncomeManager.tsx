/** CRUD delle fonti di reddito. `focusSensitive` è un toggle esplicito con help text;
 *  se l'utente marca stipendio/royalties come focusSensitive mostra un avviso (non lo blocca). */
import { useState } from 'react';
import type { IncomeStream } from '../../engine/types.ts';
import { DistributionEditor } from '../DistributionEditor.tsx';
import { Toggle, Help } from '../ui.tsx';
import { normalizeDist } from '../../engine/distributions.ts';
import { fmtEUR } from '../../lib/format.ts';

const FOCUS_HELP = 'Attivo per i redditi che dipendono dal tuo lavoro del mese (freelance, consulenze). Spento per stipendio e royalties, che arrivano comunque.';

function medianOf(s: IncomeStream): number {
  const d = normalizeDist(s.amount);
  if (d.dist === 'fixed') return d.value;
  if (d.dist === 'lognormal') return d.median;
  if (d.dist === 'triangular') return d.mode;
  if (d.dist === 'normal') return d.mean;
  if (d.dist === 'uniform') return (d.min + d.max) / 2;
  return 0;
}

const NON_SENSITIVE_CATEGORIES = ['lavoro_dipendente', 'royalties'];

function newStream(): IncomeStream {
  return {
    id: 'inc_' + Math.random().toString(36).slice(2, 8),
    name: 'Nuova fonte di reddito',
    category: 'freelance_mix_master',
    focusSensitive: true,
    type: 'recurring',
    amount: { dist: 'lognormal', median: 800, sigma: 0.5 },
    frequency: 'monthly',
    startDate: '2026-01-01',
    taxable: true,
    taxablePercentage: 100,
    enabled: true,
  };
}

export function IncomeManager({ streams, onChange }: { streams: IncomeStream[]; onChange: (s: IncomeStream[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const update = (i: number, patch: Partial<IncomeStream>) => onChange(streams.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-3">
      {streams.map((s, i) => {
        const open = openId === s.id;
        const enabled = s.enabled !== false;
        const wrongFocus = s.focusSensitive && NON_SENSITIVE_CATEGORIES.includes(s.category);
        return (
          <div key={s.id} className="panel-flat overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <Toggle checked={enabled} onChange={(v) => update(i, { enabled: v })} />
              <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setOpenId(open ? null : s.id)}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
                    {s.category} · {s.focusSensitive ? 'sensibile al focus' : 'fisso'} · {s.taxable ? 'imponibile P.IVA' : 'netto'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tnum">{fmtEUR(medianOf(s))}</div>
                  <div className="text-[10px]" style={{ color: 'rgb(var(--text-dim))' }}>mediana/mese</div>
                </div>
              </button>
              <button className="btn-danger h-8 !px-2 text-xs" onClick={() => onChange(streams.filter((_, j) => j !== i))} title="Elimina">✕</button>
            </div>

            {open && (
              <div className="space-y-4 border-t p-4" style={{ borderColor: 'rgb(var(--border))' }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="label mb-1">Nome</span>
                    <input className="field" value={s.name} onChange={(e) => update(i, { name: e.target.value })} />
                  </label>
                  <label>
                    <span className="label mb-1">Categoria</span>
                    <input className="field" value={s.category} onChange={(e) => update(i, { category: e.target.value })} />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2">
                    <Toggle checked={s.focusSensitive} onChange={(v) => update(i, { focusSensitive: v })} />
                    <span className="text-sm">Sensibile al focus</span>
                    <Help text={FOCUS_HELP} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Toggle checked={s.taxable} onChange={(v) => update(i, { taxable: v, taxablePercentage: v ? 100 : 0 })} />
                    <span className="text-sm">Imponibile (P.IVA)</span>
                    <Help text="Spento per redditi già tassati alla fonte (stipendio) o fuori dall'imponibile forfettario." />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    Tipo
                    <select className="field !w-auto !py-1" value={s.type} onChange={(e) => update(i, { type: e.target.value as IncomeStream['type'], frequency: e.target.value === 'one-time' ? 'once' : 'monthly' })}>
                      <option value="recurring">ricorrente</option>
                      <option value="one-time">una tantum</option>
                    </select>
                  </label>
                </div>

                {wrongFocus && (
                  <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgb(245 158 11 / 0.12)', border: '1px solid rgb(245 158 11 / 0.3)', color: '#fbbf24' }}>
                    Attenzione: hai marcato come «sensibile al focus» un reddito ({s.category}) che di norma arriva comunque. Questo gonfia la varianza e può mostrare un rischio di rovina che non esiste.
                  </div>
                )}

                <div>
                  <span className="label mb-1">Importo mensile</span>
                  <DistributionEditor value={s.amount} onChange={(d) => update(i, { amount: d })} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button className="btn-ghost w-full" onClick={() => onChange([...streams, newStream()])}>+ Aggiungi fonte di reddito</button>
    </div>
  );
}
