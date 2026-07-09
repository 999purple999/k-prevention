/**
 * k-prevention — server per Google Cloud Run.
 * Un solo servizio: serve la SPA React (asset statici da /dist) e le API `/api/*`.
 * Le API sono passacarte per blob cifrati end-to-end: il server non legge mai i dati.
 */
import { loadEnv } from './lib/env.js';
loadEnv();

import { getStore } from './store/index.js';
import { createApp } from './app.js';

async function main() {
  const store = await getStore();

  // Seed automatico all'avvio (Cloud Run): crea Francesco solo se non esiste, così un
  // cold start non sovrascrive le modifiche dell'utente. Usa lo stesso SERVER_SECRET del
  // processo (nessun mismatch) e le ADC del service account (nessun ADC locale necessario).
  // Import dinamico: il modulo di seed carica crypto.ts (type-stripping), che serve solo qui.
  if (process.env.SEED_ON_START === '1' && process.env.FRANCESCO_PASSWORD) {
    try {
      const { seedFrancesco } = await import('./lib/seedFrancesco.js');
      const r = await seedFrancesco(store, { password: process.env.FRANCESCO_PASSWORD, email: process.env.FRANCESCO_EMAIL, createOnly: true });
      console.log(r.skipped ? `seed: utente ${r.email} già presente (ok)` : `seed: creato ${r.email} (${r.blobCount} blob)`);
    } catch (e) {
      console.error("seed all'avvio fallito (il server parte comunque):", e.message);
    }
  }

  const app = createApp(store);
  const port = Number(process.env.PORT) || 8080;
  app.listen(port, () => {
    console.log(`k-prevention · server su :${port} · backend=${store.backend}`);
  });
}

main().catch((err) => {
  console.error('Avvio fallito:', err);
  process.exit(1);
});
