/** Assemblaggio dell'app Express, con lo store iniettato (così i test possono usare
 *  un backend in-memory). */
import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { authRouter } from './routes/auth.js';
import { dataRouter } from './routes/data.js';
import { syncRouter } from './routes/sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

export function createApp(store, { serveSpa = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true); // dietro il proxy di Cloud Run: normalizza req.ip
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, backend: store.backend }));
  app.use('/api/auth', authRouter(store));
  app.use('/api', syncRouter(store));
  app.use('/api', dataRouter(store));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'endpoint non trovato' }));

  // Error middleware: cattura gli errori (anche async, via ah()) e risponde in modo pulito.
  // eslint-disable-next-line no-unused-vars
  app.use('/api', (err, _req, res, _next) => {
    console.error('Errore API:', err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'errore interno' });
  });

  if (serveSpa) {
    const hasBuild = existsSync(join(DIST, 'index.html'));
    if (hasBuild) {
      app.use(express.static(DIST, { index: false, maxAge: '1h' }));
      app.get('*', (_req, res) => res.sendFile(join(DIST, 'index.html')));
    } else {
      app.get('*', (_req, res) =>
        res
          .status(200)
          .type('text/plain')
          .send('k-prevention API attiva. In sviluppo la SPA è servita da Vite su http://localhost:5173 (`npm run dev`).'),
      );
    }
  }
  return app;
}
