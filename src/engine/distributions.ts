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

// Coefficienti dell'approssimazione di Acklam per la quantile normale inversa.
const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

/**
 * Normale standard N(0,1) via QUANTILE INVERSA (Acklam), consumando UNA SOLA uniforme.
 * Scelta deliberata rispetto a Box-Muller: la quantile è antisimmetrica, Φ⁻¹(1-u) = -Φ⁻¹(u),
 * quindi la traiettoria antitetica (che consuma 1-u) ottiene esattamente il normale opposto
 * (corr = -1). Con Box-Muller invece cos(2π(1-u)) = cos(2π·u): i gemelli avrebbero lo STESSO
 * segno e l'antithetic AUMENTEREBBE la varianza anziché ridurla. Vedi _engineRules.8.
 */
export function standardNormal(rng: Rng): number {
  let p = rng();
  if (p < 1e-15) p = 1e-15;
  else if (p > 1 - 1e-15) p = 1 - 1e-15;
  const plow = 0.02425;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  }
  if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
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
