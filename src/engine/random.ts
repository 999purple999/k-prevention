/**
 * PRNG seminato (mulberry32) + sotto-stream indipendenti per asse di casualità.
 * `Math.random()` è VIETATO in tutto il motore: senza seed non si distingue un
 * cambiamento di risultato dovuto a un parametro modificato da uno dovuto a
 * un'estrazione diversa, e la simulazione perde il suo valore diagnostico.
 */

export type Rng = () => number;

/** mulberry32: PRNG a 32 bit, veloce e con buone proprietà per Monte Carlo. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mescola più interi in un seed a 32 bit (deriva sotto-stream indipendenti). */
export function hashSeed(...parts: number[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    let x = p | 0;
    // mescola i 32 bit dell'intero
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 16777619) >>> 0;
  }
  // avalanche finale
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** Assi di casualità: sotto-stream separati così che aggiungere una nuova sorgente
 *  non riallinei tutte le estrazioni preesistenti (e l'antitetico resti valido). */
export const AXES = {
  focus: 1,
  drop: 2,
  amount: 3,
  delay: 4,
  unforeseen: 5,
  occurrence: 6,
  expense: 7,
} as const;

export type Axis = keyof typeof AXES;

/**
 * RNG per un asse. Se `antithetic` è true restituisce `1 - u`: la traiettoria gemella
 * consuma il complemento di ogni uniforme, dimezzando la varianza delle medie a parità
 * di iterazioni. La variabilità del numero di estrazioni in un asse (es. Poisson) resta
 * confinata a quell'asse e non desincronizza gli altri.
 */
export function axisRng(seed: number, pairIndex: number, axis: Axis, antithetic: boolean): Rng {
  const base = mulberry32(hashSeed(seed, pairIndex, AXES[axis]));
  if (!antithetic) return base;
  return () => 1 - base();
}
