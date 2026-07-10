/** RiskPanel: in cima alla dashboard, sopra ogni grafico. La probabilità di rovina è
 *  il numero per cui l'app esiste — non va seppellita sotto i grafici. */
import type { SimulationOutput, RiskFlag } from '../engine/types.ts';
import { fmtPct, fmtEUR, fmtNum1 } from '../lib/format.ts';

const FLAG_INFO: Record<RiskFlag, { label: string; desc: string; tone: 'warn' | 'danger' | 'info' }> = {
  liquidita_critica: { label: 'Liquidità critica', desc: 'In almeno un mese la mediana del capitale scende sotto la soglia di rovina: metà dei futuri plausibili è a secco.', tone: 'danger' },
  capitale_negativo: { label: 'Capitale negativo', desc: 'La mediana del capitale diventa negativa in qualche mese.', tone: 'danger' },
  runway_sotto_soglia: { label: 'Autonomia sotto soglia', desc: 'Il capitale copre meno mesi di spesa del minimo che hai fissato (liquidityWarningMonths).', tone: 'warn' },
  picco_fiscale_imminente: { label: 'Picco fiscale imminente', desc: 'La cassa fiscale del mese prossimo eccede l’incasso di questo mese: l’imposta va pagata col capitale, non col reddito corrente. È il flag che anticipa giugno.', tone: 'warn' },
  soglia_forfettario_superata: { label: 'Soglia forfettario superata', desc: 'I ricavi incassati superano il limite del regime: uscita dal forfettario dall’anno successivo.', tone: 'warn' },
  uscita_immediata_forfettario: { label: 'Uscita immediata dal forfettario', desc: 'Ricavi oltre la soglia di uscita immediata: obblighi IVA retroattivi nell’anno stesso.', tone: 'danger' },
  deduzioni_ignorate_regime_forfettario: { label: 'Deduzioni ignorate (forfettario)', desc: 'Ci sono spese marcate deducibili, ma nel forfettario il coefficiente di redditività sostituisce ogni deduzione: quelle spese incidono sulla cassa, non sulle imposte. Es. i 15.000€ di studio non generano alcun risparmio d’imposta.', tone: 'info' },
  concentrazione_clienti: { label: 'Concentrazione clienti', desc: 'Oltre il 60% del reddito dipende da un solo stream: la sua perdita è un rischio che la varianza non cattura.', tone: 'warn' },
};

function ruinTone(p: number) {
  if (p < 0.05) return { color: 'rgb(var(--ok))', bg: 'rgb(var(--ok) / 0.10)', border: 'rgb(var(--ok) / 0.3)', word: 'basso' };
  if (p < 0.2) return { color: 'rgb(var(--warn))', bg: 'rgb(var(--warn) / 0.10)', border: 'rgb(var(--warn) / 0.3)', word: 'da tenere d’occhio' };
  if (p < 0.4) return { color: 'rgb(var(--warn))', bg: 'rgb(var(--warn) / 0.13)', border: 'rgb(var(--warn) / 0.36)', word: 'elevato' };
  return { color: 'rgb(var(--danger))', bg: 'rgb(var(--danger) / 0.10)', border: 'rgb(var(--danger) / 0.3)', word: 'critico' };
}

export function RiskPanel({ output, horizon, preview }: { output: SimulationOutput; horizon: number; preview: boolean }) {
  const agg = output.aggregateResult;
  const p = agg.probabilityOfRuin;
  const tone = ruinTone(p);
  const flags = agg.activeFlags;

  return (
    <div className="panel overflow-hidden p-0">
      <div className="grid gap-px md:grid-cols-[minmax(260px,340px)_1fr]" style={{ background: 'rgb(var(--border))' }}>
        {/* Probabilità di rovina */}
        <div className="p-5 sm:p-6" style={{ background: tone.bg }}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>
            Probabilità di rovina
            {preview && <span className="chip !py-0 !text-[10px]">anteprima</span>}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tnum tracking-tight" style={{ color: tone.color }}>{fmtPct(p)}</span>
            <span className="text-sm font-medium" style={{ color: tone.color }}>{tone.word}</span>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
            su {horizon} mesi · frazione di scenari che toccano la soglia di rovina almeno una volta.
          </p>
          {!agg.convergence.converged && (
            <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgb(var(--warn) / 0.12)', border: '1px solid rgb(var(--warn) / 0.3)', color: 'rgb(var(--warn))' }}>
              La simulazione non è converguta. Aumenta le iterazioni prima di fidarti di questi numeri.
            </div>
          )}
        </div>

        {/* Autonomia + crediti */}
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4" style={{ background: 'rgb(var(--border))' }}>
          {[
            { k: 'Autonomia p10', v: `${fmtNum1(agg.expectedRunwayMonths.p10)} mesi`, h: 'Scenario sfortunato (10° percentile): quanti mesi prima della rovina.' },
            { k: 'Autonomia mediana', v: `${fmtNum1(agg.expectedRunwayMonths.p50)} mesi`, h: 'Mesi di autonomia nel futuro tipico.' },
            { k: `Capitale p50 · ${horizon}m`, v: fmtEUR(agg.capitalAtHorizon[String(horizon)]?.p50 ?? 0), h: 'Mediana del capitale all’orizzonte scelto.' },
            { k: 'Crediti oltre orizzonte', v: fmtEUR(agg.outstandingReceivables.p50), h: 'Ricchezza reale ma liquidità inesistente: fatture non ancora incassate a fine simulazione.' },
          ].map((s) => (
            <div key={s.k} className="p-4" style={{ background: 'rgb(var(--panel))' }} title={s.h}>
              <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>{s.k}</div>
              <div className="mt-1 text-lg font-semibold tnum">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {flags.length > 0 && (
        <div className="border-t p-4 sm:px-6" style={{ borderColor: 'rgb(var(--border))' }}>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>Avvisi attivi</div>
          <div className="flex flex-wrap gap-2">
            {flags.map((f) => {
              const info = FLAG_INFO[f];
              const c = info.tone === 'danger' ? 'rgb(var(--danger))' : info.tone === 'warn' ? 'rgb(var(--warn))' : 'rgb(var(--accent))';
              return (
                <div key={f} className="group relative">
                  <span className="chip cursor-help" style={{ borderColor: `${c}55`, color: c }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
                    {info.label}
                  </span>
                  <div className="panel invisible absolute left-0 top-7 z-30 w-72 rounded-lg p-3 text-xs opacity-0 transition group-hover:visible group-hover:opacity-100" style={{ color: 'rgb(var(--text-dim))' }}>
                    {info.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
