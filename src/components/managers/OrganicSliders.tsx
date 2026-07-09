/** OrganicSliders: per ogni parametro organico uno slider, con accanto la FORMA della
 *  distribuzione disegnata in tempo reale. Qui sta il realismo del modello. */
import type { OrganicParameters, Distribution } from '../../engine/types.ts';
import { Sparkline } from '../Sparkline.tsx';
import { Help } from '../ui.tsx';
import { fmtNum1 } from '../../lib/format.ts';

function SliderRow({ label, value, min, max, step, onChange, fmt, help }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; fmt?: (n: number) => string; help?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-44 items-center gap-1.5 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
        {label}
        {help && <Help text={help} />}
      </div>
      <input type="range" className="flex-1" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="w-16 text-right text-sm font-medium tnum">{fmt ? fmt(value) : fmtNum1(value)}</div>
    </div>
  );
}

function Section({ title, sparkDist, children }: { title: string; sparkDist?: Distribution; children: React.ReactNode }) {
  return (
    <div className="panel-flat p-4">
      <div className="mb-3 flex items-start justify-between gap-4">
        <h4 className="text-sm font-semibold">{title}</h4>
        {sparkDist && <Sparkline dist={sparkDist} width={200} height={44} />}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

export function OrganicSliders({ org, onChange }: { org: OrganicParameters; onChange: (o: OrganicParameters) => void }) {
  const set = (patch: Partial<OrganicParameters>) => onChange({ ...org, ...patch });
  const focus = org.monthlyFocusRate as Extract<Distribution, { dist: 'beta' }>;
  const sev = org.unforeseenEvents.severity as Extract<Distribution, { dist: 'lognormal' }>;
  const arr = org.unforeseenEvents.arrivals as Extract<Distribution, { dist: 'poisson' }>;
  const delay = org.clientPaymentDelayDays as Extract<Distribution, { dist: 'triangular' }>;
  const drop = org.productivityDrop;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Focus mensile" sparkDist={focus?.dist === 'beta' ? focus : undefined}>
        {focus?.dist === 'beta' && (
          <>
            <SliderRow label="Forma α" value={focus.alpha} min={1} max={12} step={0.2} onChange={(v) => set({ monthlyFocusRate: { ...focus, alpha: v } })} help="Più alto = focus tipico più alto e coda sinistra più corta." />
            <SliderRow label="Forma β" value={focus.beta} min={1} max={12} step={0.2} onChange={(v) => set({ monthlyFocusRate: { ...focus, beta: v } })} />
          </>
        )}
      </Section>

      <Section title="Imprevisti" sparkDist={sev?.dist === 'lognormal' ? sev : undefined}>
        {arr?.dist === 'poisson' && <SliderRow label="Frequenza (λ/mese)" value={arr.lambda} min={0} max={1.5} step={0.02} onChange={(v) => set({ unforeseenEvents: { ...org.unforeseenEvents, arrivals: { ...arr, lambda: v } } })} help="Eventi attesi al mese. 0,28 ≈ uno ogni 3,6 mesi." />}
        {sev?.dist === 'lognormal' && (
          <>
            <SliderRow label="Severità mediana (€)" value={sev.median} min={50} max={2000} step={10} onChange={(v) => set({ unforeseenEvents: { ...org.unforeseenEvents, severity: { ...sev, median: v } } })} fmt={(n) => '€ ' + fmtNum1(n)} />
            <SliderRow label="Sigma (coda)" value={sev.sigma} min={0.2} max={2} step={0.05} onChange={(v) => set({ unforeseenEvents: { ...org.unforeseenEvents, severity: { ...sev, sigma: v } } })} help="Più alto = coda più pesante: gli imprevisti rari ma costosi diventano più probabili." />
          </>
        )}
      </Section>

      <Section title="Ritardi di pagamento" sparkDist={delay?.dist === 'triangular' ? delay : undefined}>
        {delay?.dist === 'triangular' && (
          <>
            <SliderRow label="Min (giorni)" value={delay.min} min={0} max={60} step={1} onChange={(v) => set({ clientPaymentDelayDays: { ...delay, min: v } })} />
            <SliderRow label="Moda (giorni)" value={delay.mode} min={delay.min} max={120} step={1} onChange={(v) => set({ clientPaymentDelayDays: { ...delay, mode: v } })} />
            <SliderRow label="Max (giorni)" value={delay.max} min={delay.mode} max={240} step={5} onChange={(v) => set({ clientPaymentDelayDays: { ...delay, max: v } })} />
          </>
        )}
      </Section>

      <Section title="Cali di produttività">
        <SliderRow label="Probabilità/mese" value={drop.monthlyProbability} min={0} max={0.6} step={0.01} onChange={(v) => set({ productivityDrop: { ...drop, monthlyProbability: v } })} fmt={(n) => fmtNum1(n * 100) + '%'} />
        <SliderRow label="Severità" value={drop.severity} min={0} max={1} step={0.05} onChange={(v) => set({ productivityDrop: { ...drop, severity: v } })} fmt={(n) => fmtNum1(n * 100) + '%'} help="Frazione di produttività persa durante un calo (non è un'assenza: si lavora al 45%)." />
        <SliderRow label="Persistenza" value={drop.persistenceFactor} min={1} max={3} step={0.1} onChange={(v) => set({ productivityDrop: { ...drop, persistenceFactor: v } })} help="Il parametro più influente e meno osservabile: >1 fa aggregare i mesi brutti nel trimestre disastroso. 1 = rumore bianco." />
      </Section>

      <Section title="Correlazione focus ↔ importi">
        <SliderRow label="ρ" value={org.incomeFocusCorrelation ?? 0} min={-1} max={1} step={0.05} onChange={(v) => set({ incomeFocusCorrelation: v })} fmt={fmtNum1} help="Positiva: nei mesi concentrati si contratta meglio. Ispessisce la coda sinistra del capitale — i mesi brutti diventano brutti due volte." />
      </Section>
    </div>
  );
}
