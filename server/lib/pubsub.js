/**
 * Pub/sub in-memory per-utente, per le notifiche di sincronizzazione via SSE.
 * Trasporta SOLO metadati ({type, lastModified}) — mai contenuto cifrato: E2E salvo.
 *
 * Limite noto (documentato nel README): è per-istanza. Su Cloud Run multi-istanza due
 * device collegati a istanze diverse non si notificano via SSE; il polling di
 * /api/data/versions (fallback lato client) garantisce comunque la convergenza.
 */
const subscribers = new Map(); // userId → Set<res>

export function subscribe(userId, res) {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (set.size === 0) subscribers.delete(userId);
  };
}

export function publish(userId, event) {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      /* la pulizia avviene sul close della connessione */
    }
  }
}
