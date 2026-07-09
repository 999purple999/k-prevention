/** Formattazione numerica italiana (it-IT). €ĝ 15.000,00 — punto migliaia, virgola decimali. */

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eurCents = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const pct1 = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtEUR = (n: number) => eur.format(Number.isFinite(n) ? n : 0);
export const fmtEURc = (n: number) => eurCents.format(Number.isFinite(n) ? n : 0);
export const fmtNum = (n: number) => num0.format(Number.isFinite(n) ? n : 0);
export const fmtNum1 = (n: number) => num1.format(Number.isFinite(n) ? n : 0);
/** frazione 0..1 → percentuale. */
export const fmtPct = (frac: number) => pct1.format(Number.isFinite(frac) ? frac : 0);

export const monthLabel = (iso: string) => {
  const [y, m] = iso.split('-');
  const names = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${names[Number(m) - 1]} '${y.slice(2)}`;
};
