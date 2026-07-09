/** Riconoscimento e normalizzazione degli import JSON (modello completo o spese studio). */
import type { Expense, IncomeStream, OrganicParameters, TaxModel, SimulationConfig, MonteCarloConfig } from '../engine/types.ts';
import type { UserData } from './data.tsx';
import { normalizeDist } from '../engine/distributions.ts';

const SCHEMA_MAJOR = 1;

export type ImportKind = 'full' | 'gear' | 'unknown';

export interface GearPreview {
  kind: 'gear';
  toAdd: Expense[];
  unverifiedCount: number;
  totalVerified: number;
  conflicts: { id: string; field: string; resolution: string }[];
}
export interface FullPreview {
  kind: 'full';
  incomeCount: number;
  expenseCount: number;
  hasOrganic: boolean;
  hasTax: boolean;
  data: Partial<UserData>;
}
export interface ImportError {
  kind: 'error';
  message: string;
}
export type ImportPreview = GearPreview | FullPreview | ImportError;

function subCategoryToCategory(sub: string): string {
  if (sub === 'hardware' || sub === 'accessori') return 'strumentazione_studio';
  return 'software_servizi';
}

function normalizeGearExpense(raw: Record<string, unknown>): Expense {
  const amountNum = typeof raw.amount === 'number' ? raw.amount : null;
  const unverified = amountNum == null;
  return {
    id: String(raw.id ?? 'exp_' + Math.random().toString(36).slice(2, 8)),
    name: String(raw.name ?? 'Voce studio'),
    category: subCategoryToCategory(String(raw.subCategory ?? 'hardware')),
    subCategory: raw.subCategory as string | undefined,
    type: (raw.type as Expense['type']) ?? 'one-time',
    amount: unverified ? { dist: 'fixed', value: 0 } : { dist: 'fixed', value: amountNum },
    currency: 'EUR',
    frequency: (raw.frequency as Expense['frequency']) ?? 'once',
    startDate: String(raw.startDate ?? '2026-04-15'),
    endDate: null,
    essential: Boolean(raw.essential),
    enabled: !unverified,
    unverifiedPrice: unverified,
    deductible: raw.deductible !== false,
    deductiblePercentage: typeof raw.deductiblePercentage === 'number' ? raw.deductiblePercentage : 100,
    vatRatePercent: typeof raw.vatRatePercent === 'number' ? raw.vatRatePercent : 22,
    amountIsGross: raw.amountIsGross !== false,
    amountNet: raw.amountNet as number | undefined,
    priceSpreadEUR: raw.priceSpreadEUR,
    confidence: raw.confidence,
    sources: raw.sources,
    notes: raw.notes as string | undefined,
  } as Expense;
}

export function detectAndPreview(obj: unknown): ImportPreview {
  if (!obj || typeof obj !== 'object') return { kind: 'error', message: 'JSON non valido.' };
  const o = obj as Record<string, unknown>;

  // Modello completo: _meta.schemaVersion + almeno incomeStreams/expenses/organicParameters
  const meta = o._meta as Record<string, unknown> | undefined;
  const looksFull = !!meta?.schemaVersion && (Array.isArray(o.incomeStreams) || o.organicParameters || o.taxModel);
  const looksGear =
    Array.isArray(o.expenses) &&
    (o.expenses as Record<string, unknown>[]).some((e) => e.category === 'Studio Setup' || e.subCategory);

  if (looksFull) {
    const major = Number(String(meta!.schemaVersion).split('.')[0]);
    if (major !== SCHEMA_MAJOR) {
      return { kind: 'error', message: `Versione schema incompatibile: attesa ${SCHEMA_MAJOR}.x, trovata ${meta!.schemaVersion}. Import rifiutato (nessuna migrazione silenziosa).` };
    }
    const data: Partial<UserData> = {};
    if (Array.isArray(o.incomeStreams)) data.incomeStreams = o.incomeStreams as IncomeStream[];
    if (Array.isArray(o.expenses)) data.expenses = o.expenses as Expense[];
    if (o.organicParameters) data.organicParameters = o.organicParameters as OrganicParameters;
    if (o.taxModel) data.taxModel = { ...(o.taxModel as TaxModel), _unverified: (o._unverified as never) ?? [] };
    if (o.simulationConfig) data.simulationConfig = o.simulationConfig as SimulationConfig;
    if (o.monteCarlo) data.monteCarlo = o.monteCarlo as MonteCarloConfig;
    return {
      kind: 'full',
      incomeCount: data.incomeStreams?.length ?? 0,
      expenseCount: data.expenses?.length ?? 0,
      hasOrganic: !!data.organicParameters,
      hasTax: !!data.taxModel,
      data,
    };
  }

  if (looksGear) {
    // Ignora l'oggetto summary; normalizza ogni voce spesa.
    const rawExpenses = (o.expenses as Record<string, unknown>[]).filter((e) => e && typeof e === 'object' && e.id);
    const toAdd = rawExpenses.map(normalizeGearExpense);
    const conflicts = Array.isArray(o._factualConflicts)
      ? (o._factualConflicts as Record<string, unknown>[]).map((c) => ({ id: String(c.id ?? ''), field: String(c.field ?? ''), resolution: String(c.resolution ?? '') }))
      : [];
    return {
      kind: 'gear',
      toAdd,
      unverifiedCount: toAdd.filter((e) => (e as { unverifiedPrice?: boolean }).unverifiedPrice).length,
      totalVerified: toAdd.filter((e) => !(e as { unverifiedPrice?: boolean }).unverifiedPrice).reduce((s, e) => s + (normalizeDist(e.amount) as { value: number }).value, 0),
      conflicts,
    };
  }

  return { kind: 'error', message: 'Formato non riconosciuto: né un modello completo (con _meta.schemaVersion) né una lista di spese studio.' };
}

/** Applica un import gear alle spese esistenti (evita duplicati per id). */
export function mergeGear(existing: Expense[], toAdd: Expense[]): Expense[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const e of toAdd) byId.set(e.id, e);
  return [...byId.values()];
}
