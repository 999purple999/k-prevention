/** Pagina "Registra" — il diario quotidiano: saldo reale, transazioni, consuntivo,
 *  e il confronto Piano vs Reale del mese. Pensata per l'uso da telefono. */
import { QuickLog } from '../components/managers/QuickLog.tsx';
import { PlanVsActual } from '../components/PlanVsActual.tsx';
import { useData } from '../lib/data.tsx';

function systemMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function Registra() {
  const { data } = useData();
  const month = data?.ledger.asOfMonth || systemMonthKey();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registra</h1>
        <p className="mt-0.5 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
          Tieni allineati piano e realtà: aggiorna il saldo, segna cosa hai speso davvero.
        </p>
      </div>
      <PlanVsActual month={month} />
      <QuickLog />
    </div>
  );
}
