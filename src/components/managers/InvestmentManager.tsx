/** Editor del conto investimento (parte di simulationConfig, viaggia con gli scenari). */
import { useState } from 'react';
import { useData } from '../../lib/data.tsx';
import type { InvestmentAccount } from '../../engine/types.ts';
import { Spinner } from '../ui.tsx';

const DEFAULT: InvestmentAccount = { enabled: true, initialBalance: 0, monthlyContribution: 1000, annualReturnPct: 7 };

export function InvestmentManager() {
  const { data, save, readOnly } = useData();
  const current = data?.simulationConfig.investmentAccount ?? null;
  const [inv, setInv] = useState<InvestmentAccount>(current ?? DEFAULT);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const persist = async (next: InvestmentAccount) => {
    if (!data || readOnly) return;
    setBusy(true); setSaved(false);
    try {
      await save('simulationConfig', { ...data.simulationConfig, investmentAccount: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setBusy(false); }
  };

  const num = (v: string) => Math.max(0, Number(v.replace(',', '.')) || 0);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={inv.enabled} onChange={(e) => { const n = { ...inv, enabled: e.target.checked }; setInv(n); void persist(n); }} />
        Attiva un conto investimento (fondo che compone nel tempo)
      </label>

      <div className={`grid gap-3 sm:grid-cols-3 ${inv.enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <label>
          <span className="label mb-1">Versamento mensile (€)</span>
          <input className="field" inputMode="decimal" value={inv.monthlyContribution} onChange={(e) => setInv({ ...inv, monthlyContribution: num(e.target.value) })} onBlur={() => void persist(inv)} />
        </label>
        <label>
          <span className="label mb-1">Rendimento annuo (%)</span>
          <input className="field" inputMode="decimal" value={inv.annualReturnPct} onChange={(e) => setInv({ ...inv, annualReturnPct: num(e.target.value) })} onBlur={() => void persist(inv)} />
        </label>
        <label>
          <span className="label mb-1">Saldo iniziale (€)</span>
          <input className="field" inputMode="decimal" value={inv.initialBalance} onChange={(e) => setInv({ ...inv, initialBalance: num(e.target.value) })} onBlur={() => void persist(inv)} />
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
        {busy && <Spinner />}
        {saved && <span style={{ color: 'rgb(var(--ok))' }}>salvato ✓</span>}
        <span>Ogni mese si spostano {inv.monthlyContribution.toLocaleString('it-IT')}€ dalla cassa al fondo. La rovina resta misurata sulla sola cassa; il patrimonio netto = cassa + fondo.</span>
      </div>
    </div>
  );
}
