import { describe, it, expect } from 'vitest';
import { simulate } from './simulate.ts';
import { sample } from './distributions.ts';
import { mulberry32 } from './random.ts';
import { percentileSorted } from './util.ts';
import type { SimulationInput, TaxModel, OrganicParameters } from './types.ts';

function forfettario(): TaxModel {
  return {
    regime: 'forfettario',
    paymentSchedule: { saldoMonth: 6, primoAccontoMonth: 6, secondoAccontoMonth: 11, accontoTotalPercent: 100, accontoSplit: [40, 60] },
    forfettario: {
      coefficienteRedditivita: 0.78,
      aliquotaSostitutiva: 5,
      aliquotaPostAgevolazione: 15,
      anniAliquotaRidotta: 5,
      annoInizioAttivita: 2024,
      limiteRicaviEUR: 85000,
      sogliaUscitaImmediataEUR: 100000,
      gestioneSeparataPercent: 26.07,
      riduzioneContributiPercent: null,
      speseDeducibili: false,
    },
  };
}

/** Organic senza incertezza: focus=1, niente drop, niente imprevisti, incasso immediato. */
function organicDeterministic(): OrganicParameters {
  return {
    monthlyFocusRate: { dist: 'fixed', value: 1 },
    unforeseenEvents: { arrivals: { dist: 'fixed', value: 0 }, severity: { dist: 'fixed', value: 0 } },
    clientPaymentDelayDays: { dist: 'fixed', value: 0 },
    productivityDrop: { monthlyProbability: 0, durationDays: { dist: 'fixed', value: 0 }, severity: 0, persistenceFactor: 1 },
    incomeFocusCorrelation: 0,
  };
}

function baseInput(over: Partial<SimulationInput> = {}): SimulationInput {
  return {
    simulationConfig: { initialCapital: 5000, startDate: '2026-01-01', simulationHorizons: [12], ruinThresholdEUR: 1000, liquidityWarningMonths: 3 },
    incomeStreams: [],
    expenses: [],
    organicParameters: organicDeterministic(),
    taxModel: forfettario(),
    monteCarlo: { iterations: 2, seed: 12345, percentiles: [5, 10, 25, 50, 75, 90, 95], antitheticVariates: false },
    ...over,
  };
}

describe('motore Monte Carlo (Fase 2, Passo 6)', () => {
  it('1. determinismo: stesso seed → output byte-identico su 3 run', () => {
    const input = baseInput({
      incomeStreams: [
        { id: 'a', name: 'mix', category: 'freelance', focusSensitive: true, type: 'recurring', amount: { dist: 'lognormal', median: 900, sigma: 0.6 }, frequency: 'monthly', startDate: '2026-01-01', taxable: true },
      ],
      organicParameters: { ...organicDeterministic(), monthlyFocusRate: { dist: 'beta', alpha: 6, beta: 2.6, scaleMin: 0.1, scaleMax: 1 }, clientPaymentDelayDays: { dist: 'triangular', min: 12, mode: 42, max: 130 } },
      monteCarlo: { iterations: 200, seed: 999, percentiles: [5, 10, 25, 50, 75, 90, 95], antitheticVariates: true },
    });
    const a = JSON.stringify(simulate(input));
    const b = JSON.stringify(simulate(input));
    const c = JSON.stringify(simulate(input));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('2. sanity deterministica: capitale finale = iniziale + Σentrate − Σuscite (nessun errore di segno)', () => {
    const input = baseInput({
      incomeStreams: [
        { id: 'salary', name: 'x', category: 'lavoro_dipendente', focusSensitive: false, type: 'recurring', amount: { dist: 'fixed', value: 1000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: false },
      ],
      expenses: [
        { id: 'rent', name: 'affitto', category: 'abitazione', type: 'recurring', amount: { dist: 'fixed', value: 500 }, frequency: 'monthly', startDate: '2026-01-01', essential: true, deductible: false },
      ],
    });
    const out = simulate(input);
    // 5000 + 12*1000 − 12*500 = 11000 ; nessuna imposta (reddito non tassabile)
    expect(out.aggregateResult.capitalAtHorizon['12'].p50).toBeCloseTo(11000, 6);
  });

  it('3. ledger: reddito 1000 al mese 0 con ritardo fisso 45gg → cassa al mese 2', () => {
    const input = baseInput({
      incomeStreams: [
        { id: 'job', name: 'job', category: 'freelance', focusSensitive: false, type: 'one-time', amount: { dist: 'fixed', value: 1000 }, frequency: 'once', startDate: '2026-01-01', taxable: false, occurrenceProbability: 1, paymentDelayDays: { dist: 'fixed', value: 45 } },
      ],
    });
    const out = simulate(input);
    expect(out.monthlyResults[0].cashIncomeReceived.p50).toBe(0);
    expect(out.monthlyResults[1].cashIncomeReceived.p50).toBe(0);
    expect(out.monthlyResults[2].cashIncomeReceived.p50).toBeCloseTo(1000, 6);
  });

  it('4. focus selettivo: focusRate 0.5 riduce solo i redditi focusSensitive', () => {
    const org = { ...organicDeterministic(), monthlyFocusRate: { dist: 'fixed' as const, value: 0.5 } };
    const sensitive = simulate(baseInput({
      organicParameters: org,
      incomeStreams: [{ id: 's', name: 's', category: 'freelance', focusSensitive: true, type: 'recurring', amount: { dist: 'fixed', value: 2000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: false }],
    }));
    const insensitive = simulate(baseInput({
      organicParameters: org,
      incomeStreams: [{ id: 's', name: 's', category: 'royalties', focusSensitive: false, type: 'recurring', amount: { dist: 'fixed', value: 2000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: false }],
    }));
    expect(sensitive.monthlyResults[0].cashIncomeReceived.p50).toBeCloseTo(1000, 6);
    expect(insensitive.monthlyResults[0].cashIncomeReceived.p50).toBeCloseTo(2000, 6);
  });

  it('5. timing fiscale forfettario: cassa fiscale zero salvo giugno (idx5) e novembre (idx10)', () => {
    const input = baseInput({
      incomeStreams: [
        { id: 'p', name: 'piva', category: 'freelance', focusSensitive: false, type: 'recurring', amount: { dist: 'fixed', value: 3000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: true },
      ],
    });
    const t = simulate(input).monthlyResults.map((m) => m.taxesPaidCash.p50);
    for (let m = 0; m <= 4; m++) expect(t[m]).toBe(0);
    expect(t[5]).toBeGreaterThan(0); // giugno: saldo + primo acconto
    for (let m = 6; m <= 9; m++) expect(t[m]).toBe(0);
    expect(t[10]).toBeGreaterThan(0); // novembre: secondo acconto
  });

  it('6. forfettario ignora le deduzioni: stesse imposte con deductible true/false, flag alzato', () => {
    const mk = (deductible: boolean) =>
      baseInput({
        incomeStreams: [{ id: 'p', name: 'piva', category: 'freelance', focusSensitive: false, type: 'recurring', amount: { dist: 'fixed', value: 3000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: true }],
        expenses: [
          { id: 'utenze', name: 'utenze', category: 'utenze', type: 'recurring', amount: { dist: 'fixed', value: 100 }, frequency: 'monthly', startDate: '2026-01-01', essential: true, deductible: true },
          { id: 'studio', name: 'studio', category: 'strumentazione_studio', type: 'one-time', amount: { dist: 'fixed', value: 15000 }, frequency: 'once', startDate: '2026-04-15', essential: false, deductible },
        ],
      });
    const withDeduction = simulate(mk(true));
    const withoutDeduction = simulate(mk(false));
    const tax1 = withDeduction.monthlyResults.reduce((s, m) => s + m.taxesPaidCash.p50, 0);
    const tax2 = withoutDeduction.monthlyResults.reduce((s, m) => s + m.taxesPaidCash.p50, 0);
    expect(tax1).toBeCloseTo(tax2, 6); // le deduzioni non toccano l'imposta forfettaria
    expect(withDeduction.aggregateResult.activeFlags).toContain('deduzioni_ignorate_regime_forfettario');
    expect(withoutDeduction.aggregateResult.activeFlags).toContain('deduzioni_ignorate_regime_forfettario');
  });

  it('7. coda pesante: p99 della severità lognormale ≥ 5× il p50', () => {
    const rng = mulberry32(42);
    const sev = new Float64Array(100_000);
    for (let i = 0; i < sev.length; i++) sev[i] = sample({ dist: 'lognormal', median: 320, sigma: 1.1, clampMax: 12000 }, rng);
    sev.sort();
    const p50 = percentileSorted(sev, 50);
    const p99 = percentileSorted(sev, 99);
    expect(p99 / p50).toBeGreaterThanOrEqual(5);
  });

  it('8. convergenza: 5000 iterazioni hanno SE della mediana minore di 500', () => {
    const mk = (iterations: number) =>
      baseInput({
        incomeStreams: [{ id: 'p', name: 'piva', category: 'freelance', focusSensitive: true, type: 'recurring', amount: { dist: 'lognormal', median: 1200, sigma: 0.6 }, frequency: 'monthly', startDate: '2026-01-01', taxable: true }],
        organicParameters: { ...organicDeterministic(), monthlyFocusRate: { dist: 'beta', alpha: 6, beta: 2.6, scaleMin: 0.1, scaleMax: 1 }, unforeseenEvents: { arrivals: { dist: 'poisson', lambda: 0.28 }, severity: { dist: 'lognormal', median: 320, sigma: 1.1, clampMax: 12000 } }, clientPaymentDelayDays: { dist: 'triangular', min: 12, mode: 42, max: 130 } },
        monteCarlo: { iterations, seed: 7, percentiles: [5, 10, 25, 50, 75, 90, 95], antitheticVariates: true },
      });
    const se500 = simulate(mk(500)).aggregateResult.convergence.standardErrorOfMedian;
    const se5000 = simulate(mk(5000)).aggregateResult.convergence.standardErrorOfMedian;
    expect(se5000).toBeLessThan(se500);
  });

  it('9. rovina: capitale 100, spese 10.000/mese → probabilityOfRuin ≈ 1', () => {
    const input = baseInput({
      simulationConfig: { initialCapital: 100, startDate: '2026-01-01', simulationHorizons: [12], ruinThresholdEUR: 1000, liquidityWarningMonths: 3 },
      expenses: [{ id: 'huge', name: 'huge', category: 'altro', type: 'recurring', amount: { dist: 'fixed', value: 10000 }, frequency: 'monthly', startDate: '2026-01-01', essential: true, deductible: false }],
    });
    expect(simulate(input).aggregateResult.probabilityOfRuin).toBeGreaterThanOrEqual(0.99);
  });

  it('10. aliquota mancante: aliquotaSostitutiva null → il motore lancia un errore che nomina il campo', () => {
    const tax = forfettario();
    tax.forfettario!.aliquotaSostitutiva = null;
    const input = baseInput({ taxModel: tax, incomeStreams: [{ id: 'p', name: 'piva', category: 'freelance', focusSensitive: false, type: 'recurring', amount: { dist: 'fixed', value: 3000 }, frequency: 'monthly', startDate: '2026-01-01', taxable: true }] });
    expect(() => simulate(input)).toThrowError(/aliquotaSostitutiva/);
  });
});
