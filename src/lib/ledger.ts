/**
 * Consuntivo (ledger): il ponte tra il piano e la vita reale.
 * Registri il saldo reale di oggi e, mese per mese, gli importi effettivi delle voci
 * (es. utenze 50€ perché ha pagato mamma) più eventuali transazioni una-tantum. La
 * proiezione viene ri-ancorata al saldo reale del mese corrente ("rolling forecast").
 */
import type { SimulationInput } from '../engine/types.ts';

export interface ActualItem {
  amount: number;
  note?: string;
}
export interface ExtraTx {
  id: string;
  label: string;
  amount: number;
  dir: 'in' | 'out';
  note?: string;
}
export interface MonthActuals {
  items: Record<string, ActualItem>; // override reale per voce (id → importo)
  extraTx: ExtraTx[];
}
export interface Ledger {
  currentCapital: number | null; // saldo reale; null → usa initialCapital del config
  asOfMonth: string | null; // "YYYY-MM"; null → usa startDate del config
  actuals: Record<string, MonthActuals>;
}

export function emptyLedger(): Ledger {
  return { currentCapital: null, asOfMonth: null, actuals: {} };
}

export function monthKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}`;
}

/** Mese di calendario "corrente" derivato da una data ISO (per il default di asOfMonth). */
export function monthKeyOf(dateIso: string): string {
  const [y, m] = dateIso.split('-');
  return `${y}-${m}`;
}

export function ensureMonth(ledger: Ledger, key: string): MonthActuals {
  return ledger.actuals[key] ?? { items: {}, extraTx: [] };
}

/**
 * Ri-àncora l'input di simulazione al presente reale: capitale iniziale = saldo reale,
 * inizio = mese corrente. Gli orizzonti restano "in avanti da oggi" (prossimi 12/24/36 mesi):
 * è la lettura più utile per l'uso quotidiano. Se il ledger è vuoto, l'input è invariato.
 */
export function anchorInput(input: SimulationInput, ledger: Ledger | null | undefined): SimulationInput {
  if (!ledger) return input;
  const cfg = { ...input.simulationConfig };
  let changed = false;
  if (ledger.currentCapital != null && Number.isFinite(ledger.currentCapital)) {
    cfg.initialCapital = ledger.currentCapital;
    changed = true;
  }
  if (ledger.asOfMonth) {
    cfg.startDate = `${ledger.asOfMonth}-01`;
    changed = true;
  }
  return changed ? { ...input, simulationConfig: cfg } : input;
}

/** Somma netta delle transazioni extra di un mese (entrate − uscite). */
export function extraTxNet(m: MonthActuals | undefined): number {
  if (!m) return 0;
  return m.extraTx.reduce((s, t) => s + (t.dir === 'in' ? t.amount : -t.amount), 0);
}
