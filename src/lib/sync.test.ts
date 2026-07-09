import { describe, it, expect } from 'vitest';
import { merge3, mergeById, mergeObject } from './merge.ts';
import { anchorInput, emptyLedger } from './ledger.ts';
import type { SimulationInput } from '../engine/types.ts';

describe('merge a 3 vie (sync)', () => {
  it('mergeById: aggiunta locale + modifica server convivono', () => {
    const base = [{ id: 'a', v: 1 }];
    const local = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }]; // ho aggiunto b
    const server = [{ id: 'a', v: 9 }]; // il server ha cambiato a
    const out = mergeById(base, local, server) as { id: string; v: number }[];
    expect(out.find((x) => x.id === 'a')?.v).toBe(9); // a: locale invariato → vince il server
    expect(out.find((x) => x.id === 'b')?.v).toBe(2); // b: aggiunta locale conservata
  });

  it('mergeById: modifica locale vince su conflitto', () => {
    const base = [{ id: 'a', v: 1 }];
    const local = [{ id: 'a', v: 5 }];
    const server = [{ id: 'a', v: 9 }];
    const out = mergeById(base, local, server) as { id: string; v: number }[];
    expect(out.find((x) => x.id === 'a')?.v).toBe(5); // entrambi cambiati → vince il locale
  });

  it('mergeById: cancellazione locale rispettata', () => {
    const base = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const local = [{ id: 'a', v: 1 }]; // ho cancellato b
    const server = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const out = mergeById(base, local, server);
    expect(out.map((x) => x.id)).toEqual(['a']);
  });

  it('mergeObject: campo cambiato solo dal server viene adottato', () => {
    const out = mergeObject({ a: 1, b: 1 }, { a: 1, b: 1 }, { a: 2, b: 1 });
    expect(out.a).toBe(2);
    expect(out.b).toBe(1);
  });

  it('merge3 ledger: attuali fusi per mese e transazioni per id', () => {
    const base = emptyLedger();
    const local = { ...emptyLedger(), actuals: { '2026-07': { items: { x: { amount: 50 } }, extraTx: [] } } };
    const server = { ...emptyLedger(), actuals: { '2026-07': { items: {}, extraTx: [{ id: 't1', label: 'a', amount: 10, dir: 'out' }] } } };
    const out = merge3('ledger', base, local, server) as typeof local;
    expect(out.actuals['2026-07'].items.x.amount).toBe(50); // override locale conservato
    expect(out.actuals['2026-07'].extraTx.length).toBe(1); // transazione server conservata
  });
});

describe('rolling forecast (anchorInput)', () => {
  const base: SimulationInput = {
    simulationConfig: { initialCapital: 12000, startDate: '2026-01-01', simulationHorizons: [12, 24, 36], ruinThresholdEUR: 1000 },
    incomeStreams: [],
    expenses: [],
    organicParameters: { monthlyFocusRate: 1, unforeseenEvents: { arrivals: 0, severity: 0 }, clientPaymentDelayDays: 0, productivityDrop: { monthlyProbability: 0, durationDays: 0, severity: 0, persistenceFactor: 1 } } as never,
    taxModel: { regime: 'forfettario', paymentSchedule: { saldoMonth: 6, primoAccontoMonth: 6, secondoAccontoMonth: 11 } } as never,
    monteCarlo: { iterations: 2, seed: 1, percentiles: [50] },
  };

  it('ri-ancora capitale e data al consuntivo', () => {
    const out = anchorInput(base, { currentCapital: 7500, asOfMonth: '2026-07', actuals: {} });
    expect(out.simulationConfig.initialCapital).toBe(7500);
    expect(out.simulationConfig.startDate).toBe('2026-07-01');
    expect(base.simulationConfig.initialCapital).toBe(12000); // input originale non mutato
  });

  it('ledger vuoto → input invariato', () => {
    expect(anchorInput(base, emptyLedger())).toBe(base);
  });
});
