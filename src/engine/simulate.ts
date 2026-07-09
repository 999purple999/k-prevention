/**
 * Motore Monte Carlo — funzione pura. Stesso input + stesso seed → output byte-identico.
 * Nessun Date.now(), nessun Math.random(), nessuna I/O. Implementa l'ordine di
 * applicazione di _engineRules.1 (non commutativo) e il contratto di ProjectionOutputTemplate.
 */
import type {
  SimulationInput,
  SimulationOutput,
  MonthlyResult,
  RiskFlag,
  PercentileBlock,
  Distribution,
} from './types.ts';
import { axisRng } from './random.ts';
import { sample, normalizeDist, standardNormal, betaScaledMoments, lognormalShifted } from './distributions.ts';
import { validateTaxModel, accruedTaxForMonth, paymentMonthsSet } from './tax.ts';
import {
  parseYearMonth,
  calendarYearOf,
  calendarMonthOf,
  dateOfMonth,
  isDueInMonth,
  percentileBlock,
  percentileSorted,
  meanOf,
  sdOf,
} from './util.ts';

export interface SimulateOptions {
  onProgress?: (done: number, total: number) => void;
  /** Se fornito, sovrascrive iterations (usato dall'anteprima a bassa risoluzione). */
  iterationsOverride?: number;
}

interface Credit {
  amount: number;
  dueMonth: number;
  taxable: number;
}

export function simulate(input: SimulationInput, opts: SimulateOptions = {}): SimulationOutput {
  const warnings: string[] = [];
  validateTaxModel(input.taxModel);

  const cfg = input.simulationConfig;
  const org = input.organicParameters;
  const tax = input.taxModel;
  const mc = input.monteCarlo;

  const horizon = Math.max(...cfg.simulationHorizons);
  const { year: startYear, month: startMonth } = parseYearMonth(cfg.startDate);
  const ruin = cfg.ruinThresholdEUR;

  const streams = input.incomeStreams.filter((s) => s.enabled !== false);
  const expenses = input.expenses.filter((e) => e.enabled !== false && (e as { unverifiedPrice?: boolean }).unverifiedPrice !== true);

  // Flag statico: forfettario + almeno una spesa deducibile → le deduzioni sono ignorate.
  const deduzioniIgnorate = tax.regime === 'forfettario' && expenses.some((e) => e.deductible === true);

  // Parametri per la correlazione focus↔importi (copula degradata, vedi _engineRules.5).
  const rho = org.incomeFocusCorrelation ?? 0;
  const focusDist = normalizeDist(org.monthlyFocusRate);
  const focusMoments =
    focusDist.dist === 'beta'
      ? betaScaledMoments(focusDist.alpha, focusDist.beta, focusDist.scaleMin, focusDist.scaleMax)
      : null;
  if (rho !== 0 && !focusMoments) {
    warnings.push('incomeFocusCorrelation ignorata: monthlyFocusRate non è una beta.');
  }

  const drop = org.productivityDrop;
  const paymentMonths = paymentMonthsSet(tax);
  const limite = tax.regime === 'forfettario' ? tax.forfettario?.limiteRicaviEUR ?? null : null;
  const sogliaUscita = tax.regime === 'forfettario' ? tax.forfettario?.sogliaUscitaImmediataEUR ?? null : null;

  const antithetic = mc.antitheticVariates !== false;
  let N = opts.iterationsOverride ?? mc.iterations;
  if (antithetic && N % 2 !== 0) N += 1;
  const totalTraj = N;
  const pairs = antithetic ? N / 2 : N;

  // Storage colonnare per mese (percentili calcolati alla fine).
  const cap = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const cashInArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const grossArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const expArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const unfArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const taxAccArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const taxPaidArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const netArr = Array.from({ length: horizon }, () => new Float64Array(totalTraj));
  const probNeg = new Float64Array(horizon);

  const ruinFlags = new Uint8Array(totalTraj);
  const runwayArr = new Float64Array(totalTraj);
  const outstandingArr = new Float64Array(totalTraj);
  const concShareArr = new Float64Array(totalTraj);

  let traj = 0;
  const runTrajectory = (pairIndex: number, anti: boolean, idx: number) => {
    const rFocus = axisRng(mc.seed, pairIndex, 'focus', anti);
    const rDrop = axisRng(mc.seed, pairIndex, 'drop', anti);
    const rAmount = axisRng(mc.seed, pairIndex, 'amount', anti);
    const rDelay = axisRng(mc.seed, pairIndex, 'delay', anti);
    const rUnf = axisRng(mc.seed, pairIndex, 'unforeseen', anti);
    const rOcc = axisRng(mc.seed, pairIndex, 'occurrence', anti);
    const rExp = axisRng(mc.seed, pairIndex, 'expense', anti);

    let capital = cfg.initialCapital;
    let ledger: Credit[] = [];
    let dropConsecutive = 0;
    let dropCarryDays = 0;
    let unpaidTaxPool = 0;
    let ruined = false;
    let runway = horizon;
    const streamCum: Record<string, number> = {};

    for (let m = 0; m < horizon; m++) {
      const cy = calendarYearOf(m, startYear, startMonth);
      const cm = calendarMonthOf(m, startMonth);

      // (1) focus del mese
      const focusRate = sample(org.monthlyFocusRate, rFocus);
      const focusZ = focusMoments ? clamp((focusRate - focusMoments.mean) / focusMoments.sd, -4, 4) : 0;

      // (2) drop di produttività, con persistenza
      const pEff = Math.min(1, drop.monthlyProbability * Math.pow(drop.persistenceFactor, dropConsecutive));
      const dropTriggered = rDrop() < pEff;
      let dropDays = dropCarryDays;
      if (dropTriggered) dropDays += sample(drop.durationDays, rDrop);
      const effDays = Math.min(30, dropDays);
      const dropFactor = 1 - (effDays / 30) * drop.severity;
      dropCarryDays = Math.max(0, dropDays - 30);
      const dropActive = dropDays > 0;
      dropConsecutive = dropActive ? dropConsecutive + 1 : 0;

      // (3-4) redditi maturati
      let grossAccrued = 0;
      for (const s of streams) {
        if (!isDueInMonth(s, m, startYear, startMonth)) continue;
        if (s.type === 'one-time' && rOcc() >= (s.occurrenceProbability ?? 1)) continue; // il lavoro può non arrivare

        let amt: number;
        const dist = normalizeDist(s.amount);
        if (s.focusSensitive) {
          if (dist.dist === 'lognormal' && rho !== 0 && focusMoments) {
            const z = standardNormal(rAmount);
            const shiftedMedian = dist.median * Math.exp(rho * dist.sigma * focusZ);
            amt = lognormalShifted(shiftedMedian, dist.sigma, dist.clampMax, z);
          } else {
            amt = sample(dist, rAmount);
          }
          amt *= focusRate * dropFactor; // focus e drop modulano SOLO i redditi focusSensitive
        } else {
          amt = sample(dist, rAmount); // stipendio/royalties passano intatti
        }
        if (amt < 0) amt = 0;

        const taxable = s.taxable ? amt * ((s.taxablePercentage ?? 100) / 100) : 0;
        const delayDist = (s.paymentDelayDays ?? org.clientPaymentDelayDays) as Distribution | number;
        const delayDays = Math.max(0, sample(delayDist, rDelay));
        ledger.push({ amount: amt, dueMonth: m + Math.ceil(delayDays / 30), taxable });
        grossAccrued += amt;
        streamCum[s.id] = (streamCum[s.id] ?? 0) + amt;
      }

      // (5-6) incassa i crediti in scadenza questo mese
      let cashIn = 0;
      let taxableCashIn = 0;
      const remaining: Credit[] = [];
      for (const c of ledger) {
        if (c.dueMonth <= m) {
          cashIn += c.amount;
          taxableCashIn += c.taxable;
        } else remaining.push(c);
      }
      ledger = remaining;

      // (7) imprevisti: N ~ Poisson(lambda), ciascuno ~ lognormale
      const nEvents = Math.round(sample(org.unforeseenEvents.arrivals, rUnf));
      let unforeseen = 0;
      for (let i = 0; i < nEvents; i++) unforeseen += sample(org.unforeseenEvents.severity, rUnf);

      // (8) spese di cassa dovute questo mese
      let expCash = 0;
      for (const e of expenses) {
        if (isDueInMonth(e, m, startYear, startMonth)) expCash += Math.max(0, sample(e.amount, rExp));
      }

      // (9) accrual fiscale + (10) cassa fiscale solo nei mesi di paymentSchedule
      const accrued = accruedTaxForMonth(tax, taxableCashIn, cy);
      unpaidTaxPool += accrued;
      let taxPaid = 0;
      if (paymentMonths.has(cm)) {
        taxPaid = unpaidTaxPool;
        unpaidTaxPool = 0;
      }

      // (11) capitale cumulato — SOLO la cassa lo tocca
      const net = cashIn - expCash - unforeseen - taxPaid;
      capital += net;

      grossArr[m][idx] = grossAccrued;
      cashInArr[m][idx] = cashIn;
      expArr[m][idx] = expCash;
      unfArr[m][idx] = unforeseen;
      taxAccArr[m][idx] = accrued;
      taxPaidArr[m][idx] = taxPaid;
      netArr[m][idx] = net;
      cap[m][idx] = capital;
      if (capital < 0) probNeg[m] += 1;
      if (capital < ruin && !ruined) {
        ruined = true;
        runway = m; // mesi sopravvissuti prima della prima rovina
      }
    }

    ruinFlags[idx] = ruined ? 1 : 0;
    runwayArr[idx] = ruined ? runway : horizon;
    outstandingArr[idx] = ledger.reduce((s, c) => s + c.amount, 0); // crediti oltre l'orizzonte

    // concentrazione clienti: quota del maggior stream sul maturato totale
    let totalCum = 0;
    let maxCum = 0;
    for (const v of Object.values(streamCum)) {
      totalCum += v;
      if (v > maxCum) maxCum = v;
    }
    concShareArr[idx] = totalCum > 0 ? maxCum / totalCum : 0;
  };

  for (let p = 0; p < pairs; p++) {
    if (antithetic) {
      runTrajectory(p, false, traj++);
      runTrajectory(p, true, traj++);
    } else {
      runTrajectory(p, false, traj++);
    }
    if (opts.onProgress && p % 50 === 0) opts.onProgress(traj, totalTraj);
  }
  opts.onProgress?.(totalTraj, totalTraj);

  // -------------------- aggregazione --------------------
  const monthBlocks = {
    gross: grossArr.map(percentileBlock),
    cashIn: cashInArr.map(percentileBlock),
    exp: expArr.map(percentileBlock),
    unf: unfArr.map(percentileBlock),
    taxAcc: taxAccArr.map(percentileBlock),
    taxPaid: taxPaidArr.map(percentileBlock),
    net: netArr.map(percentileBlock),
    cap: cap.map(percentileBlock),
  };

  const monthlyResults: MonthlyResult[] = [];
  for (let m = 0; m < horizon; m++) {
    const flags: RiskFlag[] = [];
    const capP50 = monthBlocks.cap[m].p50;
    if (capP50 < ruin) flags.push('liquidita_critica');
    if (capP50 < 0) flags.push('capitale_negativo');
    // runway = capitale / spesa mensile mediana recente
    const recentExp = medianRecentExpense(monthBlocks.exp, m);
    if (recentExp > 0 && capP50 / recentExp < (cfg.liquidityWarningMonths ?? 0)) flags.push('runway_sotto_soglia');
    // picco fiscale imminente: la cassa fiscale del mese prossimo eccede l'incasso di questo mese
    if (m + 1 < horizon && monthBlocks.taxPaid[m + 1].p50 > monthBlocks.cashIn[m].p50 && monthBlocks.taxPaid[m + 1].p50 > 0) {
      flags.push('picco_fiscale_imminente');
    }
    if (deduzioniIgnorate) flags.push('deduzioni_ignorate_regime_forfettario');

    monthlyResults.push({
      monthIndex: m,
      date: dateOfMonth(m, startYear, startMonth),
      grossIncomeAccrued: monthBlocks.gross[m],
      cashIncomeReceived: monthBlocks.cashIn[m],
      totalExpensesCash: monthBlocks.exp[m],
      unforeseenCosts: monthBlocks.unf[m],
      taxesAccrued: monthBlocks.taxAcc[m],
      taxesPaidCash: monthBlocks.taxPaid[m],
      netCashFlow: monthBlocks.net[m],
      cumulativeCapital: monthBlocks.cap[m],
      probabilityOfNegativeCapital: probNeg[m] / totalTraj,
      riskFlags: flags,
    });
  }

  // capitale ad ogni orizzonte + campioni grezzi (per l'istogramma)
  const capitalAtHorizon: Record<string, PercentileBlock> = {};
  const capitalSamples: Record<string, number[]> = {};
  for (const h of cfg.simulationHorizons) {
    const idx = Math.min(h, horizon) - 1;
    capitalAtHorizon[String(h)] = percentileBlock(cap[idx]);
    capitalSamples[String(h)] = Array.from(cap[idx]);
  }

  // mese peggiore (mediana più bassa)
  let worstMonthIndex = 0;
  for (let m = 1; m < horizon; m++) if (monthBlocks.cap[m].p50 < monthBlocks.cap[worstMonthIndex].p50) worstMonthIndex = m;

  // convergenza: SE della mediana all'orizzonte massimo
  const lastCap = Float64Array.from(cap[horizon - 1]).sort();
  const median = percentileSorted(lastCap, 50);
  const mean = meanOf(lastCap);
  const sd = sdOf(lastCap, mean);
  const seMedian = (1.2533 * sd) / Math.sqrt(totalTraj);
  const tolerance = mc.convergenceCheck?.tolerance ?? 0.01;
  const converged = Math.abs(median) > 0 ? seMedian / Math.abs(median) < tolerance : seMedian < tolerance;

  // flag aggregati statici
  const activeFlags = new Set<RiskFlag>();
  for (const mr of monthlyResults) for (const f of mr.riskFlags) activeFlags.add(f);
  if (deduzioniIgnorate) activeFlags.add('deduzioni_ignorate_regime_forfettario');
  const concShareSorted = Float64Array.from(concShareArr).sort();
  if (percentileSorted(concShareSorted, 50) > 0.6) activeFlags.add('concentrazione_clienti');
  // soglia forfettario (incasso annuo mediano) — valutazione semplice sull'incasso totale annualizzato
  if (limite != null || sogliaUscita != null) {
    const annualCash = estimateMaxAnnualCash(cashInArr, startMonth, horizon, totalTraj);
    if (sogliaUscita != null && annualCash > sogliaUscita) {
      activeFlags.add('uscita_immediata_forfettario');
      activeFlags.add('soglia_forfettario_superata');
    } else if (limite != null && annualCash > limite) {
      activeFlags.add('soglia_forfettario_superata');
    }
  }

  const runwaySorted = Float64Array.from(runwayArr).sort();
  const outstandingSorted = Float64Array.from(outstandingArr).sort();

  return {
    monthlyResults,
    aggregateResult: {
      probabilityOfRuin: sumU8(ruinFlags) / totalTraj,
      expectedRunwayMonths: {
        p10: percentileSorted(runwaySorted, 10),
        p50: percentileSorted(runwaySorted, 50),
        p90: percentileSorted(runwaySorted, 90),
      },
      worstMonthIndex,
      capitalAtHorizon,
      outstandingReceivables: {
        p50: percentileSorted(outstandingSorted, 50),
        p90: percentileSorted(outstandingSorted, 90),
      },
      activeFlags: [...activeFlags],
      convergence: { converged, standardErrorOfMedian: seMedian, iterationsUsed: totalTraj },
    },
    samples: { capitalAtHorizon: capitalSamples },
    meta: { horizon, iterations: totalTraj, seed: mc.seed, antithetic, warnings },
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
function sumU8(a: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}
function medianRecentExpense(expBlocks: PercentileBlock[], m: number): number {
  const from = Math.max(0, m - 2);
  let s = 0;
  let n = 0;
  for (let i = from; i <= m; i++) {
    s += expBlocks[i].p50;
    n++;
  }
  return n ? s / n : 0;
}
/** Stima grezza del massimo incasso annuo mediano (per i flag soglia forfettario). */
function estimateMaxAnnualCash(cashInArr: Float64Array[], startMonth: number, horizon: number, totalTraj: number): number {
  // Somma mediana per anno solare.
  const byYear: Record<number, Float64Array> = {};
  for (let m = 0; m < horizon; m++) {
    const yr = Math.floor((startMonth - 1 + m) / 12);
    byYear[yr] = byYear[yr] ?? new Float64Array(totalTraj);
    const src = cashInArr[m];
    const dst = byYear[yr];
    for (let i = 0; i < totalTraj; i++) dst[i] += src[i];
  }
  let maxMedian = 0;
  for (const arr of Object.values(byYear)) {
    const sorted = Float64Array.from(arr).sort();
    const med = percentileSorted(sorted, 50);
    if (med > maxMedian) maxMedian = med;
  }
  return maxMedian;
}
