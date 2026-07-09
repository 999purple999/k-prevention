/**
 * Merge a 3 vie per la risoluzione dei conflitti di sincronizzazione.
 * base = ultimo stato sincronizzato; local = le mie modifiche; server = lo stato remoto.
 * Regola generale: se solo uno dei due lati è cambiato rispetto a base, vince quello;
 * se entrambi sono cambiati in modo diverso, vince `local` (last-write-wins del writer),
 * ma la fusione è granulare (per id nelle liste, per campo negli oggetti, per mese/voce
 * nel consuntivo) così i conflitti reali sono rari.
 */

function eq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface HasId {
  id: string;
  [k: string]: unknown;
}

/** Merge di liste di oggetti con `id` (income, expenses). */
export function mergeById(base: HasId[], local: HasId[], server: HasId[]): HasId[] {
  const bMap = new Map(base.map((x) => [x.id, x]));
  const lMap = new Map(local.map((x) => [x.id, x]));
  const sMap = new Map(server.map((x) => [x.id, x]));
  const ids = new Set([...lMap.keys(), ...sMap.keys()]);
  const out: HasId[] = [];
  // Preserva un ordine sensato: prima l'ordine locale, poi le aggiunte del server.
  const order = [...local.map((x) => x.id), ...server.map((x) => x.id).filter((id) => !lMap.has(id))];
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id) || !ids.has(id)) continue;
    seen.add(id);
    const b = bMap.get(id);
    const l = lMap.get(id);
    const s = sMap.get(id);
    if (l && s) out.push(eq(l, b) ? s : l); // se locale invariato → server; altrimenti locale
    else if (l && !s) {
      if (!b || !eq(l, b)) out.push(l); // aggiunto/modificato in locale → tienilo; se solo cancellato dal server e invariato → cade
    } else if (!l && s) {
      if (!b) out.push(s); // aggiunto dal server
      // se era in base ma non in locale → cancellato in locale → cade
    }
  }
  return out;
}

/** Merge shallow campo-per-campo di due oggetti (organic, tax, config, mc, profile). */
export function mergeObject(base: Record<string, unknown>, local: Record<string, unknown>, server: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...server };
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
  for (const k of keys) {
    const b = base?.[k];
    const l = local[k];
    const s = server[k];
    if (eq(l, s)) out[k] = l;
    else if (eq(l, b)) out[k] = s; // locale invariato → server
    else out[k] = l; // locale cambiato (anche se pure il server) → locale
  }
  return out;
}

/** Merge del consuntivo: attuali fusi per mese e per voce; transazioni per id. */
export function mergeLedger(base: any, local: any, server: any): any {
  const out: any = { ...server };
  // scalari: last-write-wins con preferenza locale se cambiato
  for (const k of ['currentCapital', 'asOfMonth']) {
    out[k] = eq(local?.[k], base?.[k]) ? server?.[k] : local?.[k];
  }
  const months = new Set([...Object.keys(local?.actuals ?? {}), ...Object.keys(server?.actuals ?? {})]);
  const actuals: any = {};
  for (const m of months) {
    const bm = base?.actuals?.[m] ?? { items: {}, extraTx: [] };
    const lm = local?.actuals?.[m] ?? { items: {}, extraTx: [] };
    const sm = server?.actuals?.[m] ?? { items: {}, extraTx: [] };
    actuals[m] = {
      items: mergeObject(bm.items ?? {}, lm.items ?? {}, sm.items ?? {}),
      extraTx: mergeById(bm.extraTx ?? [], lm.extraTx ?? [], sm.extraTx ?? []),
    };
  }
  out.actuals = actuals;
  return out;
}

/** Dispatch per tipo di dato. */
export function merge3(type: string, base: unknown, local: unknown, server: unknown): unknown {
  if (base == null) return local; // niente antenato: preferisci l'intento locale
  if (type === 'incomeStreams' || type === 'expenses') {
    return mergeById((base as HasId[]) ?? [], (local as HasId[]) ?? [], (server as HasId[]) ?? []);
  }
  if (type === 'ledger') return mergeLedger(base, local, server);
  if (Array.isArray(local) || Array.isArray(server)) return local ?? server;
  return mergeObject((base as Record<string, unknown>) ?? {}, (local as Record<string, unknown>) ?? {}, (server as Record<string, unknown>) ?? {});
}
