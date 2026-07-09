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
