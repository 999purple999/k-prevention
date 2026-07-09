/** Sincronizzazione: stream SSE degli eventi di cambiamento (solo metadati). */
import { Router } from 'express';
import { requireAuth } from '../lib/http.js';
import { subscribe } from '../lib/pubsub.js';

export function syncRouter() {
  const r = Router();

  // GET /api/sync/stream — Server-Sent Events. Il client si abbona e riceve
  // { type, lastModified } quando un altro dispositivo modifica i dati.
  r.get('/sync/stream', requireAuth(), (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');
    res.write(': connesso\n\n');

    const unsubscribe = subscribe(req.userId, res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': hb\n\n');
      } catch {
        /* ignore */
      }
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return r;
}
