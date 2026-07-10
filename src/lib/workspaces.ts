/** Multi-workspace: più "istanze" indipendenti (es. Personale + Azienda) per lo stesso
 *  account, ognuna con i propri redditi/spese/fisco/scenari, più una vista Consolidata.
 *
 *  Backward-compatible: il workspace di default ("Personale", id "default") usa i tipi
 *  di dato NUDI (expenses, incomeStreams, …) — i dati esistenti, nessuna migrazione. Gli
 *  altri workspace usano tipi namespaced `w_<id>_<tipo>`. */
export type WorkspaceKind = 'personal' | 'business' | 'other';

export interface Workspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
}

export const DEFAULT_WORKSPACE: Workspace = { id: 'default', name: 'Personale', kind: 'personal' };
export const CONSOLIDATO_ID = '__all__';

/** Tipo di dato sul server per (workspace, tipoBase). Default = tipo nudo. */
export function typeForWs(wsId: string, baseType: string): string {
  return wsId === 'default' ? baseType : `w_${wsId}_${baseType}`;
}

/** Estrae il tipo base se `fullType` appartiene al workspace attivo, altrimenti null. */
export function baseTypeForWs(wsId: string, fullType: string, baseTypes: readonly string[]): string | null {
  if (wsId === 'default') return baseTypes.includes(fullType) ? fullType : null;
  const p = `w_${wsId}_`;
  if (!fullType.startsWith(p)) return null;
  const base = fullType.slice(p.length);
  return baseTypes.includes(base) ? base : null;
}

export function newWorkspaceId(): string {
  // [a-z0-9]{8}, compatibile con l'allowlist `w_<id>_…` (server + Worker).
  let s = '';
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(8);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < 8; i++) s += alpha[buf[i] % alpha.length];
  return s;
}

export const KIND_LABEL: Record<WorkspaceKind, string> = {
  personal: 'Personale',
  business: 'Azienda',
  other: 'Altro',
};
