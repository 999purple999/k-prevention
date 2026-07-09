/** QuickLog: l'azione quotidiana. Aggiorna il saldo reale, registra gli importi effettivi
 *  delle voci del mese (es. utenze 50€ invece di 300 perché ha pagato mamma) e le
 *  transazioni una-tantum. Tutto si ripersiste cifrato e si sincronizza tra dispositivi. */
import { useState } from 'react';
import { useData } from '../../lib/data.tsx';
import { type Ledger, ensureMonth, extraTxNet } from '../../lib/ledger.ts';
import { normalizeDist } from '../../engine/distributions.ts';
import { fmtEUR, fmtEURc, monthLabel } from '../../lib/format.ts';
import { Help } from '../ui.tsx';

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function systemMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function medianOf(item: { amount: unknown }): number {
  const d = normalizeDist(item.amount as never);
  if (d.dist === 'fixed') return d.value;
  if (d.dist === 'triangular') return d.mode;
  if (d.dist === 'lognormal') return d.median;
  if (d.dist === 'normal') return d.mean;
  if (d.dist === 'uniform') return (d.min + d.max) / 2;
  return 0;
}

export function QuickLog() {
  const { data, save } = useData();
  const ledger = data?.ledger;
  const [month, setMonth] = useState(ledger?.asOfMonth || systemMonthKey());
  const [txLabel, setTxLabel] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDir, setTxDir] = useState<'out' | 'in'>('out');
  const [showConsuntivo, setShowConsuntivo] = useState(false);
  if (!data || !ledger) return null;

  const setLedger = (next: Ledger) => save('ledger', next);
  const monthData = ensureMonth(ledger, month);

  const setBalance = (v: number) => setLedger({ ...ledger, currentCapital: Number.isFinite(v) ? v : null });
  const setAsOf = () => setLedger({ ...ledger, asOfMonth: month });

  const addTx = () => {
    const amount = Number(txAmount);
    if (!amount || !txLabel.trim()) return;
    const tx = { id: 'tx_' + Math.random().toString(36).slice(2, 9), label: txLabel.trim(), amount: Math.abs(amount), dir: txDir, note: '' };
    const next: Ledger = { ...ledger, actuals: { ...ledger.actuals, [month]: { ...monthData, extraTx: [...monthData.extraTx, tx] } } };
    // La transazione aggiorna anche il saldo reale (entra/esce davvero dalla cassa).
    if (ledger.currentCapital != null) next.currentCapital = ledger.currentCapital + (txDir === 'in' ? tx.amount : -tx.amount);
    setLedger(next);
    setTxLabel('');
    setTxAmount('');
  };

  const removeTx = (id: string) => {
    const tx = monthData.extraTx.find((t) => t.id === id);
    const next: Ledger = { ...ledger, actuals: { ...ledger.actuals, [month]: { ...monthData, extraTx: monthData.extraTx.filter((t) => t.id !== id) } } };
    if (tx && ledger.currentCapital != null) next.currentCapital = ledger.currentCapital - (tx.dir === 'in' ? tx.amount : -tx.amount);
    setLedger(next);
  };

  const setItemActual = (itemId: string, amount: number | null, note?: string) => {
    const items = { ...monthData.items };
    if (amount == null) delete items[itemId];
    else items[itemId] = { amount, note: note ?? items[itemId]?.note };
    setLedger({ ...ledger, actuals: { ...ledger.actuals, [month]: { ...monthData, items } } });
  };

  const recurringItems = [
    ...data.incomeStreams.filter((s) => s.enabled !== false && s.type !== 'one-time').map((s) => ({ id: s.id, name: s.name, planned: medianOf(s), kind: 'in' as const })),
    ...data.expenses.filter((e) => e.enabled !== false && e.type !== 'one-time').map((e) => ({ id: e.id, name: e.name, planned: medianOf(e), kind: 'out' as const })),
  ];

  return (
    <div className="space-y-4">
      {/* Saldo reale */}
      <div className="panel-flat p-4">
        <div className="flex items-center justify-between">
          <div className="label flex items-center gap-1.5">Saldo reale oggi <Help text="Quanto hai davvero sul conto adesso. È l'àncora della proiezione: da qui in avanti si simula il futuro." /></div>
          {ledger.asOfMonth !== month && (
            <button className="text-xs font-medium" style={{ color: 'rgb(var(--accent))' }} onClick={setAsOf}>ancora qui →</button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-lg" style={{ color: 'rgb(var(--text-dim))' }}>€</span>
          <input
            type="number"
            className="field tnum !border-0 !bg-transparent !px-0 text-3xl font-bold focus:!shadow-none"
            value={ledger.currentCapital ?? ''}
            placeholder={String(data.simulationConfig.initialCapital)}
            onChange={(e) => setBalance(Number(e.target.value))}
          />
        </div>
        <div className="mt-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          Àncora della proiezione: {ledger.asOfMonth ? monthLabel(`${ledger.asOfMonth}-01`) : 'inizio piano'}
        </div>
      </div>

      {/* Mese + transazione rapida */}
      <div className="panel-flat p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="label">Registra nel mese</div>
          <input type="month" className="field !w-auto !py-1 text-sm" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid rgb(var(--border-strong))' }}>
            {(['out', 'in'] as const).map((d) => (
              <button key={d} onClick={() => setTxDir(d)} className="px-3 py-2 text-sm font-medium transition"
                style={txDir === d ? { background: d === 'in' ? '#10b981' : '#ef4444', color: '#fff' } : { color: 'rgb(var(--text-dim))' }}>
                {d === 'in' ? 'Entrata' : 'Uscita'}
              </button>
            ))}
          </div>
          <input className="field !w-auto flex-1" placeholder="Descrizione (es. spesa, benzina)" value={txLabel} onChange={(e) => setTxLabel(e.target.value)} />
          <div className="relative">
            <input type="number" className="field tnum !w-28 !pr-6" placeholder="0" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTx()} />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>€</span>
          </div>
          <button className="btn-primary" onClick={addTx}>Registra</button>
        </div>

        {monthData.extraTx.length > 0 && (
          <div className="mt-3 space-y-1">
            {monthData.extraTx.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm" style={{ background: 'rgb(var(--bg)/.4)' }}>
                <span className="truncate">{t.label}</span>
                <span className="flex items-center gap-3">
                  <span className="tnum font-medium" style={{ color: t.dir === 'in' ? '#34d399' : '#f87171' }}>{t.dir === 'in' ? '+' : '−'}{fmtEURc(t.amount)}</span>
                  <button className="text-xs" style={{ color: 'rgb(var(--text-dim))' }} onClick={() => removeTx(t.id)}>✕</button>
                </span>
              </div>
            ))}
            <div className="flex justify-between px-3 pt-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
              <span>Netto extra del mese</span>
              <span className="tnum">{fmtEURc(extraTxNet(monthData))}</span>
            </div>
          </div>
        )}
      </div>

      {/* Consuntivo per voce (piano vs reale) */}
      <div className="panel-flat p-4">
        <button className="flex w-full items-center justify-between" onClick={() => setShowConsuntivo((s) => !s)}>
          <div className="label flex items-center gap-1.5">Consuntivo voci · {monthLabel(`${month}-01`)} <Help text="Per ogni voce ricorrente registra l'importo REALE del mese. Vuoto = usa il piano." /></div>
          <span style={{ color: 'rgb(var(--text-dim))' }}>{showConsuntivo ? '−' : '+'}</span>
        </button>
        {showConsuntivo && (
          <div className="mt-3 space-y-2">
            {recurringItems.map((it) => {
              const actual = monthData.items[it.id];
              return (
                <div key={it.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.name}</div>
                    <div className="text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>piano {fmtEUR(it.planned)} · {it.kind === 'in' ? 'entrata' : 'uscita'}</div>
                  </div>
                  <div className="relative">
                    <input type="number" className="field tnum !w-28 !py-1.5 !pr-6" placeholder={String(Math.round(it.planned))}
                      value={actual?.amount ?? ''} onChange={(e) => setItemActual(it.id, e.target.value === '' ? null : Number(e.target.value))} />
                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>€</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
