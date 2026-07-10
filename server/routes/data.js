/** Rotte dati: passacarte per blob opachi. Il server NON fa mai JSON.parse del contenuto.
 *  Concorrenza ottimistica (baseVersion → 409) e notifiche di sync (solo metadati). */
import { Router } from 'express';
import { requireAuth, ah } from '../lib/http.js';
import { isValidDataType } from '../lib/constants.js';
import { newId } from '../lib/serverCrypto.js';
import { publish } from '../lib/pubsub.js';

export function dataRouter(store) {
  const r = Router();
  r.use(requireAuth());

  // GET /api/data — bootstrap: tutti i blob dell'utente in un colpo.
  r.get('/data', ah(async (req, res) => {
    res.json(await store.getAllData(req.userId));
  }));

  // GET /api/data/versions — solo {dataType, lastModified} (polling di sincronizzazione).
  // Deve precedere /data/:type.
  r.get('/data/versions', ah(async (req, res) => {
    res.json(await store.getDataVersions(req.userId));
  }));

  // GET /api/data/:type
  r.get('/data/:type', ah(async (req, res) => {
    if (!isValidDataType(req.params.type)) return res.status(400).json({ error: 'tipo non valido' });
    const row = await store.getData(req.userId, req.params.type);
    if (!row) return res.status(404).json({ error: 'non trovato' });
    res.json(row);
  }));

  // PUT /api/data/:type  body { encryptedBlob, iv, baseVersion? }
  r.put('/data/:type', ah(async (req, res) => {
    const type = req.params.type;
    if (!isValidDataType(type)) return res.status(400).json({ error: 'tipo non valido' });
    const { encryptedBlob, iv, baseVersion } = req.body || {};
    if (typeof encryptedBlob !== 'string' || typeof iv !== 'string') {
      return res.status(400).json({ error: 'payload non valido' });
    }
    // Concorrenza ottimistica: se il client ha una versione più vecchia della corrente, 409.
    if (baseVersion != null) {
      const current = await store.getData(req.userId, type);
      if (current && current.lastModified > baseVersion) {
        return res.status(409).json({ error: 'conflitto', current });
      }
    }
    const ts = Date.now();
    await store.putData(req.userId, type, newId(), encryptedBlob, iv, ts);
    publish(req.userId, { type, lastModified: ts });
    res.json({ ok: true, lastModified: ts });
  }));

  // DELETE /api/data/:type
  r.delete('/data/:type', ah(async (req, res) => {
    if (!isValidDataType(req.params.type)) return res.status(400).json({ error: 'tipo non valido' });
    await store.deleteData(req.userId, req.params.type);
    publish(req.userId, { type: req.params.type, lastModified: Date.now(), deleted: true });
    res.json({ ok: true });
  }));

  // ---- Scenari (simulazioni salvate, stile Git) ----

  // Un workspace id valido: 'default' o [a-z0-9]{1,16} (esclude '__all__' = consolidato).
  const wsIdOr = (v, fallback = 'default') => (typeof v === 'string' && /^[a-z0-9]{1,16}$/.test(v) ? v : fallback);

  // POST /api/simulations  body { name, encryptedBlob, iv, parentId?, isMain?, workspaceId? }
  r.post('/simulations', ah(async (req, res) => {
    const { name, encryptedBlob, iv, parentId, isMain, workspaceId } = req.body || {};
    if (typeof name !== 'string' || typeof encryptedBlob !== 'string' || typeof iv !== 'string') {
      return res.status(400).json({ error: 'payload non valido' });
    }
    const id = newId();
    const now = Date.now();
    await store.createSimulation(req.userId, {
      id, name, workspace_id: wsIdOr(workspaceId), created_at: now, updated_at: now, parent_id: parentId ?? null, is_main: !!isMain, encrypted_blob: encryptedBlob, iv,
    });
    publish(req.userId, { type: 'simulations', lastModified: now });
    res.status(201).json({ id, createdAt: now });
  }));

  // GET /api/simulations?workspace=<id> — metadati estesi, filtrati per workspace.
  r.get('/simulations', ah(async (req, res) => {
    res.json(await store.listSimulations(req.userId, wsIdOr(req.query.workspace)));
  }));

  // GET /api/simulations/:id — blob cifrato.
  r.get('/simulations/:id', ah(async (req, res) => {
    const sim = await store.getSimulation(req.userId, req.params.id);
    if (!sim) return res.status(404).json({ error: 'non trovata' });
    res.json(sim);
  }));

  // PUT /api/simulations/:id  body { name?, encryptedBlob?, iv? }
  r.put('/simulations/:id', ah(async (req, res) => {
    const { name, encryptedBlob, iv } = req.body || {};
    const now = Date.now();
    const ok = await store.updateSimulation(req.userId, req.params.id, {
      name, encrypted_blob: encryptedBlob, iv, updated_at: now,
    });
    if (!ok) return res.status(404).json({ error: 'non trovata' });
    publish(req.userId, { type: 'simulations', lastModified: now });
    res.json({ ok: true, updatedAt: now });
  }));

  // DELETE /api/simulations/:id
  r.delete('/simulations/:id', ah(async (req, res) => {
    await store.deleteSimulation(req.userId, req.params.id);
    publish(req.userId, { type: 'simulations', lastModified: Date.now() });
    res.json({ ok: true });
  }));

  // POST /api/simulations/:id/promote — imposta lo scenario come principale.
  r.post('/simulations/:id/promote', ah(async (req, res) => {
    const ok = await store.promoteSimulation(req.userId, req.params.id, Date.now());
    if (!ok) return res.status(404).json({ error: 'non trovata' });
    publish(req.userId, { type: 'simulations', lastModified: Date.now() });
    res.json({ ok: true });
  }));

  return r;
}
