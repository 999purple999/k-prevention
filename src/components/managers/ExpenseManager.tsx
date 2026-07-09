/** CRUD delle spese. In forfettario il campo `deductible` è VISIBILE ma DISABILITATO,
 *  con la nota: le spese non abbassano le imposte, solo la liquidità. */
import { useState } from 'react';
import type { Expense } from '../../engine/types.ts';
import { DistributionEditor } from '../DistributionEditor.tsx';
import { Toggle, Help } from '../ui.tsx';
import { normalizeDist } from '../../engine/distributions.ts';
import { fmtEUR } from '../../lib/format.ts';

function medianOf(e: Expense): number {
  const d = normalizeDist(e.amount);
  if (d.dist === 'fixed') return d.value;
  if (d.dist === 'triangular') return d.mode;
  if (d.dist === 'normal') return d.mean;
  if (d.dist === 'lognormal') return d.median;
  if (d.dist === 'uniform') return (d.min + d.max) / 2;
  return 0;
}

function newExpense(): Expense {
  return {
    id: 'exp_' + Math.random().toString(36).slice(2, 8),
    name: 'Nuova spesa',
    category: 'altro',
    type: 'recurring',
    amount: { dist: 'fixed', value: 100 },
    frequency: 'monthly',
    startDate: '2026-01-01',
    essential: false,
    enabled: true,
    deductible: false,
    deductiblePercentage: 0,
  };
}

export function ExpenseManager({ expenses, onChange, forfettario }: { expenses: Expense[]; onChange: (e: Expense[]) => void; forfettario: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const update = (i: number, patch: Partial<Expense>) => onChange(expenses.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const shown = expenses.map((e, i) => ({ e, i })).filter(({ e }) => !filter || e.name.toLowerCase().includes(filter.toLowerCase()) || String(e.category).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-3">
      {expenses.length > 6 && (
        <input className="field" placeholder="Filtra spese…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {shown.map(({ e, i }) => {
        const open = openId === e.id;
        const enabled = e.enabled !== false;
        const unverified = (e as { unverifiedPrice?: boolean }).unverifiedPrice === true;
        return (
          <div key={e.id} className="panel-flat overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <Toggle checked={enabled} onChange={(v) => update(i, { enabled: v })} />
              <button className="flex flex-1 items-center gap-3 text-left" onClick={() => setOpenId(open ? null : e.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{e.name}</span>
                    {unverified && <span className="chip !py-0 text-[10px]" style={{ color: '#fbbf24', borderColor: 'rgb(245 158 11 / 0.4)' }}>prezzo da verificare</span>}
                    {e.essential && <span className="chip !py-0 text-[10px]">essenziale</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
                    {e.category} · {e.type === 'one-time' ? 'una tantum' : e.frequency === 'yearly' ? 'annuale' : 'mensile'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tnum">{unverified ? '—' : fmtEUR(medianOf(e))}</div>
                </div>
              </button>
              <button className="btn-danger h-8 !px-2 text-xs" onClick={() => onChange(expenses.filter((_, j) => j !== i))} title="Elimina">✕</button>
            </div>

            {open && (
              <div className="space-y-4 border-t p-4" style={{ borderColor: 'rgb(var(--border))' }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="label mb-1">Nome</span>
                    <input className="field" value={e.name} onChange={(ev) => update(i, { name: ev.target.value })} />
                  </label>
                  <label>
                    <span className="label mb-1">Categoria</span>
                    <input className="field" value={e.category} onChange={(ev) => update(i, { category: ev.target.value })} />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex items-center gap-2">
                    <Toggle checked={e.essential} onChange={(v) => update(i, { essential: v })} />
                    <span className="text-sm">Essenziale</span>
                    <Help text="Obbligatoria vs discrezionale. Non cambia il capitale, ma abilita gli scenari «cosa succede se rinuncio a questo?»." />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    Frequenza
                    <select className="field !w-auto !py-1" value={e.type === 'one-time' ? 'once' : e.frequency} onChange={(ev) => {
                      const val = ev.target.value;
                      if (val === 'once') update(i, { type: 'one-time', frequency: 'once' });
                      else update(i, { type: 'recurring', frequency: val as Expense['frequency'] });
                    }}>
                      <option value="monthly">mensile</option>
                      <option value="yearly">annuale</option>
                      <option value="once">una tantum</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: 'rgb(var(--bg) / 0.4)', border: '1px solid rgb(var(--border))' }}>
                  <div className="flex items-center gap-2">
                    <Toggle checked={!!e.deductible} onChange={(v) => !forfettario && update(i, { deductible: v })} />
                    <span className="text-sm" style={{ opacity: forfettario ? 0.55 : 1 }}>Deducibile</span>
                    <Help text="Percentuale deducibile ai fini fiscali (solo regime ordinario)." />
                  </div>
                  {forfettario && (
                    <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
                      In regime forfettario le spese non sono deducibili: il coefficiente di redditività sostituisce ogni deduzione. Questa spesa incide sulla tua liquidità, non sulle tue imposte.
                    </p>
                  )}
                </div>

                <div>
                  <span className="label mb-1">Importo</span>
                  <DistributionEditor value={e.amount} onChange={(d) => update(i, { amount: d })} />
                </div>
                <label>
                  <span className="label mb-1">Data (per una tantum / inizio)</span>
                  <input type="date" className="field" value={e.startDate} onChange={(ev) => update(i, { startDate: ev.target.value })} />
                </label>
              </div>
            )}
          </div>
        );
      })}
      <button className="btn-ghost w-full" onClick={() => onChange([...expenses, newExpense()])}>+ Aggiungi spesa</button>
    </div>
  );
}
