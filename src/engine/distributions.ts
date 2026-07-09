/**
 * Campionamento dalle distribuzioni definite in schema.json. Ogni sampler consuma
 * uniformi dal PRNG seminato; nessun Math.random(). Vedi _engineRules.0.
 */
import type { Distribution, DistributionInput } from './types.ts';
import type { Rng } from './random.ts';

/** Zucchero sintattico: un numero nudo diventa {dist:'fixed'}. Idempotente. */
export function normalizeDist(d: DistributionInput): Distribution {
  if (typeof d === 'number') return { dist: 'fixed', value: d };
  return d;
}

/** Normale standard N(0,1) via Box-Muller (consuma due uniformi). */
export function standardNormal(rng: Rng): number {
  let u1 = rng();
  if (u1 < 1e-12) u1 = 1e-12; // evita log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Gamma(shape,1) — Marsaglia & Tsang. Serve per la beta. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) {
    // Boosting: Gamma(a) = Gamma(a+1) * U^(1/a)
    const u = Math.max(rng(), 1e-12);
    return gamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number, v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(rng(), 1e-12);
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function poissonKnuth(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Estrae un campione dalla distribuzione, usando il PRNG fornito. */
export function sample(distInput: DistributionInput, rng: Rng): number {
  const d = normalizeDist(distInput);
  switch (d.dist) {
    case 'fixed':
      return d.value;
    case 'uniform':
      return d.min + (d.max - d.min) * rng();
    case 'triangular': {
      const u = rng();
      const { min, mode, max } = d;
      const fc = (mode - min) / (max - min);
      if (u < fc) return min + Math.sqrt(u * (max - min) * (mode - min));
      return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
    case 'normal': {
      let x = d.mean + d.sd * standardNormal(rng);
      if (d.clampMin != null && x < d.clampMin) x = d.clampMin;
      if (d.clampMax != null && x > d.clampMax) x = d.clampMax;
      return x;
    }
    case 'lognormal': {
      const z = standardNormal(rng);
      let x = Math.exp(Math.log(d.median) + d.sigma * z);
      if (d.clampMax != null && x > d.clampMax) x = d.clampMax;
      return x;
    }
    case 'beta': {
      const g1 = gamma(d.alpha, rng);
      const g2 = gamma(d.beta, rng);
      const x = g1 / (g1 + g2); // in [0,1]
      return d.scaleMin + (d.scaleMax - d.scaleMin) * x;
    }
    case 'poisson':
      return poissonKnuth(d.lambda, rng);
    case 'bernoulli':
      return rng() < d.p ? 1 : 0;
    default: {
      const _exhaustive: never = d;
      throw new Error(`Distribuzione non supportata: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Media e deviazione standard teoriche di una distribuzione (per la correlazione focus). */
export function betaScaledMoments(alpha: number, beta: number, scaleMin: number, scaleMax: number) {
  const meanC = alpha / (alpha + beta);
  const varC = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
  const span = scaleMax - scaleMin;
  return { mean: scaleMin + span * meanC, sd: span * Math.sqrt(varC) };
}

/** Campione lognormale con mediana traslata (usato dalla copula degradata di focus/importi). */
export function lognormalShifted(median: number, sigma: number, clampMax: number | null | undefined, z: number): number {
  let x = Math.exp(Math.log(median) + sigma * z);
  if (clampMax != null && x > clampMax) x = clampMax;
  return x;
}
