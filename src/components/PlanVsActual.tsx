/** Piano vs Reale: per il mese corrente confronta l'atteso col registrato. Il feedback
 *  quotidiano ("stai spendendo X in meno del piano") che rende l'app utile davvero. */
import { useData } from '../lib/data.tsx';
import { normalizeDist } from '../engine/distributions.ts';
import { fmtEUR, monthLabel } from '../lib/format.ts';

function median(item: { amount: unknown }): number {
  const d = normalizeDist(item.amount as never);
  if (d.dist === 'fixed') return d.value;
  if (d.dist === 'triangular') return d.mode;
  if (d.dist === 'lognormal') return d.median;
  if (d.dist === 'normal') return d.mean;
  if (d.dist === 'uniform') return (d.min + d.max) / 2;
  return 0;
}

export function PlanVsActual({ month }: { month: string }) {
  const { data } = useData();
  if (!data) return null;
  const md = data.ledger.actuals[month];

  const expenses = data.expenses.filter((e) => e.enabled !== false && e.type !== 'one-time');
  const incomes = data.incomeStreams.filter((s) => s.enabled !== false && s.type !== 'one-time');

  const plannedExp = expenses.reduce((s, e) => s + median(e), 0);
  const plannedInc = incomes.reduce((s, i) => s + median(i), 0);

  const actualExp = expenses.reduce((s, e) => s + (md?.items[e.id]?.amount ?? median(e)), 0) + (md ? md.extraTx.filter((t) => t.dir === 'out').reduce((a, t) => a + t.amount, 0) : 0);
  const actualInc = incomes.reduce((s, i) => s + (md?.items[i.id]?.amount ?? median(i)), 0) + (md ? md.extraTx.filter((t) => t.dir === 'in').reduce((a, t) => a + t.amount, 0) : 0);

  const hasActuals = !!md && (Object.keys(md.items).length > 0 || md.extraTx.length > 0);
  const netPlan = plannedInc - plannedExp;
  const netReal = actualInc - actualExp;
  const delta = netReal - netPlan;

  const Row = ({ label, plan, real, invert }: { label: string; plan: number; real: number; invert?: boolean }) => {
    const diff = real - plan;
    const good = invert ? diff < 0 : diff > 0;
    return (
      <div className="flex items-center justify-between py-1.5 text-sm">
        <span style={{ color: 'rgb(var(--text-dim))' }}>{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="tnum" style={{ color: 'rgb(var(--text-dim))' }}>{fmtEUR(plan)}</span>
          <span style={{ color: 'rgb(var(--text-dim))' }}>→</span>
          <span className="tnum font-semibold">{fmtEUR(real)}</span>
          {Math.abs(diff) >= 1 && (
            <span className="tnum text-xs" style={{ color: good ? '#34d399' : '#f59e0b' }}>
              {diff > 0 ? '+' : '−'}{fmtEUR(Math.abs(diff))}
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Piano vs Reale · {monthLabel(`${month}-01`)}</h3>
      </div>
      {!hasActuals ? (
        <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
          Nessun consuntivo per questo mese. Registra un importo reale (in «Registra») per vedere come stai andando rispetto al piano.
        </p>
      ) : (
        <>
          <div className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
            <Row label="Entrate" plan={plannedInc} real={actualInc} />
            <Row label="Uscite" plan={plannedExp} real={actualExp} invert />
            <Row label="Netto del mese" plan={netPlan} real={netReal} />
          </div>
          <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: delta >= 0 ? 'rgb(16 185 129 / 0.1)' : 'rgb(245 158 11 / 0.1)', color: delta >= 0 ? '#6ee7b7' : '#fbbf24' }}>
            {delta >= 0
              ? `Questo mese stai andando ${fmtEUR(Math.abs(delta))} meglio del piano. 👌`
              : `Questo mese stai andando ${fmtEUR(Math.abs(delta))} sotto il piano. Occhio.`}
          </div>
        </>
      )}
    </div>
  );
}
