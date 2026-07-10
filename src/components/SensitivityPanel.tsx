/** Analisi di sensibilità (tornado): mostra quali leve muovono di più la probabilità di
 *  rovina. Sostituisce i vecchi preset con qualcosa di davvero azionabile. */
import { useMemo } from 'react';
import { useData } from '../lib/data.tsx';
import { useSensitivity } from '../hooks/useSensitivity.ts';
import { Spinner, Help } from './ui.tsx';
import { fmtPct } from '../lib/format.ts';

export function SensitivityPanel() {
  const { buildSimulationInput } = useData();
  const sens = useSensitivity();
  const input = useMemo(() => buildSimulationInput(), [buildSimulationInput]);

  return (
    <div className="panel p-4 sm:p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Le leve che contano</h2>
          <Help text="Porta ogni fattore a un estremo favorevole e a uno sfavorevole, ri-simula, e misura di quanto si muove la probabilità di rovina. In cima le leve su cui agire davvero." />
        </div>
        <button className="btn-primary !py-1.5 text-sm" disabled={!input || sens.running} onClick={() => input && sens.run(input)}>
          {sens.running ? <Spinner /> : null}
          {sens.rows ? 'Rianalizza' : 'Analizza le leve'}
        </button>
      </div>
      <p className="text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
        Non un preset fisso: l'app calcola quali dei tuoi parametri spostano di più il rischio, così sai dove intervenire.
      </p>

      {sens.running && (
        <div className="mt-4">
          <div className="mb-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Analisi in corso… {Math.round(sens.progress * 100)}%</div>
          <div className="h-1 overflow-hidden rounded-full" style={{ background: 'rgb(var(--border))' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round(sens.progress * 100)}%`, background: 'rgb(var(--accent))' }} />
          </div>
        </div>
      )}

      {sens.error && <div className="mt-3 text-xs" style={{ color: 'rgb(var(--danger))' }}>{sens.error}</div>}

      {sens.rows && !sens.running && sens.baseRuin != null && (
        <div className="mt-4 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>
            <span>fattore</span>
            <span>rovina: favorevole → sfavorevole</span>
          </div>
          {sens.rows.map((r) => {
            const lo = Math.min(r.lowRuin, r.highRuin) * 100;
            const hi = Math.max(r.lowRuin, r.highRuin) * 100;
            const base = (sens.baseRuin ?? 0) * 100;
            return (
              <div key={r.key} className="grid grid-cols-[minmax(9rem,1.1fr)_2fr_auto] items-center gap-3">
                <div className="min-w-0" title={r.hint}>
                  <div className="truncate text-sm font-medium">{r.label}</div>
                </div>
                <div className="relative h-6 rounded-md" style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border))' }}>
                  {/* banda da favorevole a sfavorevole */}
                  <div className="absolute top-0 bottom-0 rounded-md" style={{ left: `${lo}%`, width: `${Math.max(1.5, hi - lo)}%`, background: 'linear-gradient(90deg, rgb(var(--ok) / 0.55), rgb(var(--danger) / 0.6))' }} />
                  {/* tacca baseline */}
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: `${base}%`, background: 'rgb(var(--text))', opacity: 0.5 }} title={`baseline ${fmtPct(sens.baseRuin ?? 0)}`} />
                  <div className="absolute inset-0 flex items-center justify-between px-1.5 text-[10px] font-medium tnum">
                    <span style={{ color: 'rgb(var(--ok))' }}>{Math.round(r.lowRuin * 100)}%</span>
                    <span style={{ color: 'rgb(var(--danger))' }}>{Math.round(r.highRuin * 100)}%</span>
                  </div>
                </div>
                <div className="w-14 text-right">
                  <div className="text-sm font-semibold tnum">{Math.round(r.swing * 100)}<span className="text-[10px] font-normal" style={{ color: 'rgb(var(--text-dim))' }}> pt</span></div>
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>
            La barra va dallo scenario favorevole (verde) a quello sfavorevole (rosso); la tacca chiara è il tuo valore attuale. «pt» = punti percentuali di swing sulla probabilità di rovina.
          </p>
        </div>
      )}
    </div>
  );
}
