/** Utilità pure per il motore: date su griglia mensile e statistiche d'ordine. */
import type { Expense, IncomeStream } from './types.ts';

/** Parsing "YYYY-MM-DD" → {year, month(1-12)} senza dipendere dal fuso orario. */
export function parseYearMonth(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.split('-');
  return { year: Number(y), month: Number(m) };
}

/** Indice di mese (0-based) di una data rispetto all'inizio della simulazione. */
export function monthIndexFromStart(dateStr: string, startYear: number, startMonth: number): number {
  const { year, month } = parseYearMonth(dateStr);
  return (year - startYear) * 12 + (month - startMonth);
}

export function calendarYearOf(m: number, startYear: number, startMonth: number): number {
  return startYear + Math.floor((startMonth - 1 + m) / 12);
}
export function calendarMonthOf(m: number, startMonth: number): number {
  return ((startMonth - 1 + m) % 12) + 1;
}

/** ISO date (primo del mese) del mese m. */
export function dateOfMonth(m: number, startYear: number, startMonth: number): string {
  const y = calendarYearOf(m, startYear, startMonth);
  const mo = calendarMonthOf(m, startMonth);
  return `${y}-${String(mo).padStart(2, '0')}-01`;
}

/** L'elemento (reddito o spesa) è dovuto/matura nel mese m? */
export function isDueInMonth(
  item: IncomeStream | Expense,
  m: number,
  startYear: number,
  startMonth: number,
): boolean {
  const startIdx = monthIndexFromStart(item.startDate, startYear, startMonth);
  const endIdx = item.endDate ? monthIndexFromStart(item.endDate, startYear, startMonth) : Infinity;
  if (m > endIdx) return false;

  const isOnce = item.type === 'one-time' || item.frequency === 'once';
  if (isOnce) return m === startIdx;

  if (m < startIdx) return false;
  switch (item.frequency) {
    case 'monthly':
      return true;
    case 'quarterly':
      return (m - startIdx) % 3 === 0;
    case 'yearly':
      return (m - startIdx) % 12 === 0;
    case 'custom': {
      const step = Math.max(1, Math.round((item.customFrequencyDays ?? 30) / 30));
      return (m - startIdx) % step === 0;
    }
    default:
      return true;
  }
}

/** Percentile con interpolazione lineare su un array GIÀ ordinato. */
export function percentileSorted(sorted: Float64Array | number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = (p / 100) * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function meanOf(arr: Float64Array | number[]): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return arr.length ? s / arr.length : 0;
}

export function sdOf(arr: Float64Array | number[], mean: number): number {
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    s += d * d;
  }
  return Math.sqrt(arr.length ? s / arr.length : 0);
}

import type { PercentileBlock } from './types.ts';

/** Costruisce un PercentileBlock dai valori grezzi (li ordina in-place su una copia). */
export function percentileBlock(values: Float64Array): PercentileBlock {
  const sorted = Float64Array.from(values).sort();
  const mean = meanOf(values);
  return {
    p5: percentileSorted(sorted, 5),
    p10: percentileSorted(sorted, 10),
    p25: percentileSorted(sorted, 25),
    p50: percentileSorted(sorted, 50),
    p75: percentileSorted(sorted, 75),
    p90: percentileSorted(sorted, 90),
    p95: percentileSorted(sorted, 95),
    mean,
  };
}
