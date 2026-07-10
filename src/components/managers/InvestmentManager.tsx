/** Editor del conto investimento (parte di simulationConfig, viaggia con gli scenari). */
import { useEffect, useState } from 'react';
import { useData } from '../../lib/data.tsx';
import type { InvestmentAccount } from '../../engine/types.ts';
import { Spinner } from '../ui.tsx';

const DEFAULT: InvestmentAccount = { enabled: true, initialBalance: 0, monthlyContribution: 1000, annualReturnPct: 7 };
const num = (v: string) => Math.max(0, Number(String(v).replace(',', '.')) || 0);

export function InvestmentManager() {
  const { data, save, readOnly, activeWorkspace } = useData();
  const stored = data?.simulationConfig.investmentAccount ?? null;
  // Stato dei campi come STRINGA durante la digitazione (così i decimali non spariscono).
  const [enabled, setEnabled] = useState(stored?.enabled ?? false);
  const [contribution, setContribution] = useState(String(stored?.monthlyContribution ?? DEFAULT.monthlyContribution));
  const [ret, setRet] = useState(String(stored?.annualReturnPct ?? DEFAULT.annualReturnPct));
  const [initial, setInitial] = useState(String(stored?.initialBalance ?? DEFAULT.initialBalance));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Risincronizza quando cambia il workspace o l'account salvato (evita valori stantii
  // e scritture sul workspace sbagliato).
  useEffect(() => {
    const s = data?.simulationConfig.investmentAccount ?? null;
    setEnabled(s?.enabled ?? false);
    setContribution(String(s?.monthlyContribution ?? DEFAULT.monthlyContribution));
    setRet(String(s?.annualReturnPct ?? DEFAULT.annualReturnPct));
    setInitial(String(s?.initialBalance ?? DEFAULT.initialBalance));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace]);

  const persist = async (next: InvestmentAccount) => {
    if (!data || readOnly) return;
    setBusy(true); setSaved(false);
    try {
      await save('simulationConfig', { ...data.simulationConfig, investmentAccount: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setBusy(false); }
  };

  const current = (): InvestmentAccount => ({ enabled, monthlyContribution: num(contribution), annualReturnPct: num(ret), initialBalance: num(initial) });
  const commit = () => void persist(current());

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); void persist({ ...current(), enabled: e.target.checked }); }} />
        Attiva un conto investimento (fondo che compone nel tempo)
      </label>

      <div className={`grid gap-3 sm:grid-cols-3 ${enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <label>
          <span className="label mb-1">Versamento mensile (€)</span>
          <input className="field" inputMode="decimal" value={contribution} onChange={(e) => setContribution(e.target.value)} onBlur={commit} />
        </label>
        <label>
          <span className="label mb-1">Rendimento annuo (%)</span>
          <input className="field" inputMode="decimal" value={ret} onChange={(e) => setRet(e.target.value)} onBlur={commit} />
        </label>
        <label>
          <span className="label mb-1">Saldo iniziale (€)</span>
          <input className="field" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} onBlur={commit} />
        </label>
      </div>

      <div className="flex items-center gap-2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
        {busy && <Spinner />}
        {saved && <span style={{ color: 'rgb(var(--ok))' }}>salvato ✓</span>}
        <span>Ogni mese si sposta la quota dalla cassa al fondo (solo se la cassa lo permette). La rovina resta sulla sola cassa; il patrimonio netto = cassa + fondo.</span>
      </div>
    </div>
  );
}
