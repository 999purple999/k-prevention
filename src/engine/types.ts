/** Tipi del motore di simulazione. Rispecchiano `schema.json` (Prompt 1). */

export type Distribution =
  | { dist: 'fixed'; value: number }
  | { dist: 'uniform'; min: number; max: number }
  | { dist: 'triangular'; min: number; mode: number; max: number }
  | { dist: 'normal'; mean: number; sd: number; clampMin?: number | null; clampMax?: number | null }
  | { dist: 'lognormal'; median: number; sigma: number; clampMax?: number | null }
  | { dist: 'beta'; alpha: number; beta: number; scaleMin: number; scaleMax: number }
  | { dist: 'poisson'; lambda: number }
  | { dist: 'bernoulli'; p: number };

/** Un numero nudo è input legale: il normalizzatore lo trasforma in {dist:'fixed'}. */
export type DistributionInput = Distribution | number;

export interface IncomeStream {
  id: string;
  name: string;
  category: string;
  focusSensitive: boolean;
  type: 'recurring' | 'one-time';
  amount: DistributionInput;
  occurrenceProbability?: number;
  currency?: string;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'once' | 'custom';
  customFrequencyDays?: number | null;
  startDate: string;
  endDate?: string | null;
  taxable: boolean;
  taxablePercentage?: number;
  paymentDelayDays?: DistributionInput | null;
  enabled?: boolean;
}

export interface Expense {
  id: string;
  name: string;
  category: string;
  type: 'recurring' | 'one-time';
  amount: DistributionInput;
  currency?: string;
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'once' | 'custom';
  customFrequencyDays?: number | null;
  startDate: string;
  endDate?: string | null;
  essential: boolean;
  deductible: boolean;
  deductiblePercentage?: number;
  vatRatePercent?: number;
  amountIsGross?: boolean;
  enabled?: boolean;
  [key: string]: unknown; // chiavi additive da fonti esterne (conservate)
}

export interface ProductivityDrop {
  monthlyProbability: number;
  durationDays: DistributionInput;
  severity: number;
  persistenceFactor: number;
}

export interface OrganicParameters {
  monthlyFocusRate: DistributionInput;
  unforeseenEvents: { arrivals: DistributionInput; severity: DistributionInput };
  clientPaymentDelayDays: DistributionInput;
  productivityDrop: ProductivityDrop;
  incomeFocusCorrelation?: number;
}

export interface PaymentSchedule {
  saldoMonth: number;
  primoAccontoMonth: number;
  secondoAccontoMonth: number;
  accontoTotalPercent?: number | null;
  accontoSplit?: [number, number] | null;
  inpsInstallmentMonths?: number[] | null;
  inpsSaldoMonth?: number | null;
}

export interface Forfettario {
  coefficienteRedditivita: number | null;
  aliquotaSostitutiva: number | null;
  aliquotaPostAgevolazione: number | null;
  anniAliquotaRidotta: number | null;
  annoInizioAttivita: number | null;
  limiteRicaviEUR: number | null;
  sogliaUscitaImmediataEUR: number | null;
  cassaPrevidenziale?: string | null;
  gestioneSeparataPercent: number | null;
  riduzioneContributiPercent: number | null;
  speseDeducibili?: boolean;
}

export interface Ordinario {
  scaglioniIRPEF: { min: number; max: number | null; aliquota: number | null }[] | null;
  detrazioni?: { nome: string; importo: number | null }[] | null;
  addizionaleRegionalePercent: number | null;
  addizionaleComunalePercent: number | null;
  contributiINPSPercent: number | null;
  speseDeducibili?: boolean;
}

export interface TaxModel {
  regime: 'forfettario' | 'ordinario';
  paymentSchedule: PaymentSchedule;
  forfettario?: Forfettario;
  ordinario?: Ordinario;
}

export interface MonteCarloConfig {
  iterations: number;
  seed: number;
  percentiles: number[];
  convergenceCheck?: { enabled?: boolean; metric?: string; tolerance?: number };
  antitheticVariates?: boolean;
}

/**
 * Conto investimento opzionale: ogni mese si sposta `monthlyContribution` dalla cassa al
 * fondo (la cassa cala, il patrimonio no: è un trasferimento) e il fondo cresce al tasso
 * annuo dato. La rovina resta misurata sulla sola CASSA (il fondo non è liquidità corrente).
 */
export interface InvestmentAccount {
  enabled: boolean;
  initialBalance: number; // saldo di partenza del fondo (EUR)
  monthlyContribution: number; // EUR/mese spostati dalla cassa al fondo
  annualReturnPct: number; // rendimento annuo lordo % (es. 7)
}

export interface SimulationConfig {
  initialCapital: number;
  startDate: string;
  simulationHorizons: number[];
  currency?: string;
  timeGrid?: string;
  receivablesLedger?: boolean;
  ruinThresholdEUR: number;
  liquidityWarningMonths?: number;
  investmentAccount?: InvestmentAccount | null;
}

export interface SimulationInput {
  simulationConfig: SimulationConfig;
  incomeStreams: IncomeStream[];
  expenses: Expense[];
  organicParameters: OrganicParameters;
  taxModel: TaxModel;
  monteCarlo: MonteCarloConfig;
}

export type RiskFlag =
  | 'liquidita_critica'
  | 'runway_sotto_soglia'
  | 'picco_fiscale_imminente'
  | 'soglia_forfettario_superata'
  | 'uscita_immediata_forfettario'
  | 'deduzioni_ignorate_regime_forfettario'
  | 'concentrazione_clienti'
  | 'capitale_negativo';

export interface PercentileBlock {
  p5: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  mean: number;
}

export interface MonthlyResult {
  monthIndex: number;
  date: string;
  grossIncomeAccrued: PercentileBlock;
  cashIncomeReceived: PercentileBlock;
  totalExpensesCash: PercentileBlock;
  unforeseenCosts: PercentileBlock;
  taxesAccrued: PercentileBlock;
  taxesPaidCash: PercentileBlock;
  netCashFlow: PercentileBlock;
  cumulativeCapital: PercentileBlock;
  /** Saldo del fondo investimento (presente solo se investmentAccount.enabled). */
  investmentBalance?: PercentileBlock;
  /** Patrimonio netto = cassa + fondo (presente solo se investmentAccount.enabled). */
  netWorth?: PercentileBlock;
  probabilityOfNegativeCapital: number;
  riskFlags: RiskFlag[];
}

export interface AggregateResult {
  probabilityOfRuin: number;
  expectedRunwayMonths: { p10: number; p50: number; p90: number };
  worstMonthIndex: number;
  capitalAtHorizon: Record<string, PercentileBlock>;
  /** Patrimonio netto (cassa + fondo) a ciascun orizzonte, se il fondo è attivo. */
  netWorthAtHorizon?: Record<string, PercentileBlock>;
  outstandingReceivables: { p50: number; p90: number };
  activeFlags: RiskFlag[];
  convergence: { converged: boolean; standardErrorOfMedian: number; iterationsUsed: number };
}

export interface SimulationOutput {
  monthlyResults: MonthlyResult[];
  aggregateResult: AggregateResult;
  /** Campioni grezzi del capitale (e del patrimonio netto) a ciascun orizzonte, per l'istogramma. */
  samples: { capitalAtHorizon: Record<string, number[]>; netWorthAtHorizon?: Record<string, number[]> };
  meta: {
    horizon: number;
    iterations: number;
    seed: number;
    antithetic: boolean;
    warnings: string[];
    runtimeMs?: number;
  };
}
