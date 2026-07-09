/** TaxSelector: regime + parametri. I valori null (_unverified) hanno bordo di avviso
 *  e il testo «inseriscilo prima di simulare». Il pulsante Simula è disabilitato finché
 *  restano null (gestito dalla dashboard). */
import type { TaxModel } from '../../engine/types.ts';
import type { UnverifiedEntry } from '../../lib/data.tsx';
import { Help } from '../ui.tsx';

type TaxWithMeta = TaxModel & { _unverified?: UnverifiedEntry[] };

function TaxNum({ label, value, onChange, suffix, help, step = 1 }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void; suffix?: string; help?: string; step?: number }) {
  const isNull = value == null;
  return (
    <label className="block">
      <span className="label mb-1 flex items-center gap-1.5">{label}{help && <Help text={help} />}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          className={`field tnum ${isNull ? 'field-warn' : ''}`}
          value={value ?? ''}
          placeholder="da verificare"
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>{suffix}</span>}
      </div>
      {isNull && <span className="mt-1 block text-[11px]" style={{ color: '#fbbf24' }}>Valore non verificato: inseriscilo prima di simulare.</span>}
    </label>
  );
}

export function TaxSelector({ tax, onChange }: { tax: TaxWithMeta; onChange: (t: TaxWithMeta) => void }) {
  const f = tax.forfettario;
  const ps = tax.paymentSchedule;
  const setF = (patch: Partial<NonNullable<TaxModel['forfettario']>>) => onChange({ ...tax, forfettario: { ...f!, ...patch } });
  const setPS = (patch: Partial<TaxModel['paymentSchedule']>) => onChange({ ...tax, paymentSchedule: { ...ps, ...patch } });
  const unverified = (tax._unverified ?? []).filter((u) => u.filledWithLastKnown);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="label">Regime</span>
        <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1px solid rgb(var(--border-strong))' }}>
          {(['forfettario', 'ordinario'] as const).map((r) => (
            <button
              key={r}
              className="px-4 py-1.5 text-sm font-medium capitalize transition"
              style={tax.regime === r ? { background: 'rgb(var(--accent))', color: '#04141a' } : { color: 'rgb(var(--text-dim))' }}
              onClick={() => onChange({ ...tax, regime: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {unverified.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgb(245 158 11 / 0.10)', border: '1px solid rgb(245 158 11 / 0.28)', color: '#fbbf24' }}>
          <strong>Aliquote basate sui valori 2025</strong> (ultimo dato noto). La simulazione gira, ma conferma con un commercialista
          i valori 2026 prima di prendere decisioni: {unverified.map((u) => u.path.split('.').pop()).join(', ')}.
        </div>
      )}

      {tax.regime === 'forfettario' && f && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TaxNum label="Coefficiente redditività" value={f.coefficienteRedditivita} step={0.01} onChange={(v) => setF({ coefficienteRedditivita: v })} help="Dipende dal codice ATECO. 0,78 per molte attività." />
            <TaxNum label="Aliquota sostitutiva" suffix="%" value={f.aliquotaSostitutiva} onChange={(v) => setF({ aliquotaSostitutiva: v })} help="Aliquota agevolata dei primi anni." />
            <TaxNum label="Aliquota a regime" suffix="%" value={f.aliquotaPostAgevolazione} onChange={(v) => setF({ aliquotaPostAgevolazione: v })} />
            <TaxNum label="Anni aliquota ridotta" value={f.anniAliquotaRidotta} onChange={(v) => setF({ anniAliquotaRidotta: v })} />
            <TaxNum label="Anno inizio attività" value={f.annoInizioAttivita} onChange={(v) => setF({ annoInizioAttivita: v })} />
            <TaxNum label="INPS gestione separata" suffix="%" value={f.gestioneSeparataPercent} step={0.01} onChange={(v) => setF({ gestioneSeparataPercent: v })} />
            <TaxNum label="Limite ricavi" suffix="€" value={f.limiteRicaviEUR} step={1000} onChange={(v) => setF({ limiteRicaviEUR: v })} />
            <TaxNum label="Soglia uscita immediata" suffix="€" value={f.sogliaUscitaImmediataEUR} step={1000} onChange={(v) => setF({ sogliaUscitaImmediataEUR: v })} />
          </div>
        </>
      )}

      {tax.regime === 'ordinario' && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text-dim))' }}>
          Regime ordinario: scaglioni IRPEF, addizionali e INPS. Il motore applica un'approssimazione mensile per annualizzazione. Inserisci gli scaglioni nel JSON importato o passa al forfettario per questa demo.
        </div>
      )}

      <div>
        <span className="label mb-2 block">Calendario delle scadenze (mese)</span>
        <div className="grid grid-cols-3 gap-3">
          <TaxNum label="Saldo" value={ps.saldoMonth} onChange={(v) => setPS({ saldoMonth: v ?? 6 })} help="Mese del saldo dell'imposta." />
          <TaxNum label="Primo acconto" value={ps.primoAccontoMonth} onChange={(v) => setPS({ primoAccontoMonth: v ?? 6 })} />
          <TaxNum label="Secondo acconto" value={ps.secondoAccontoMonth} onChange={(v) => setPS({ secondoAccontoMonth: v ?? 11 })} />
        </div>
      </div>
    </div>
  );
}
