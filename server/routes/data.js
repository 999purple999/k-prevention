/** Rotte dati: passacarte per blob opachi. Il Worker/serve NON fa mai JSON.parse del
 *  contenuto, non valida, non logga i blob. Valida solo che :type sia in allowlist. */
import { Router } from 'express';
import { requireAuth, ah } from '../lib/http.js';
import { isValidDataType } from '../lib/constants.js';
import { newId } from '../lib/serverCrypto.js';

export function dataRouter(store) {
  const r = Router();
  r.use(requireAuth());

  // GET /api/data — bootstrap: tutti i blob dell'utente in un colpo (metadati + cifrato).
  r.get('/data', ah(async (req, res) => {
    res.json(await store.getAllData(req.userId));
  }));

  // GET /api/data/:type
  r.get('/data/:type', ah(async (req, res) => {
    if (!isValidDataType(req.params.type)) return res.status(400).json({ error: 'tipo non valido' });
    const row = await store.getData(req.userId, req.params.type);
    if (!row) return res.status(404).json({ error: 'non trovato' });
    res.json(row);
  }));

  // PUT /api/data/:type  body { encryptedBlob, iv }
  r.put('/data/:type', ah(async (req, res) => {
    if (!isValidDataType(req.params.type)) return res.status(400).json({ error: 'tipo non valido' });
    const { encryptedBlob, iv } = req.body || {};
    if (typeof encryptedBlob !== 'string' || typeof iv !== 'string') {
      return res.status(400).json({ error: 'payload non valido' });
    }
    const ts = Date.now();
    await store.putData(req.userId, req.params.type, newId(), encryptedBlob, iv, ts);
    res.json({ ok: true, lastModified: ts });
  }));

  // DELETE /api/data/:type
  r.delete('/data/:type', ah(async (req, res) => {
    if (!isValidDataType(req.params.type)) return res.status(400).json({ error: 'tipo non valido' });
    await store.deleteData(req.userId, req.params.type);
    res.json({ ok: true });
  }));

  // POST /api/simulations  body { name, encryptedBlob, iv }
  r.post('/simulations', ah(async (req, res) => {
    const { name, encryptedBlob, iv } = req.body || {};
    if (typeof name !== 'string' || typeof encryptedBlob !== 'string' || typeof iv !== 'string') {
      return res.status(400).json({ error: 'payload non valido' });
    }
    const id = newId();
    const created_at = Date.now();
    await store.createSimulation(req.userId, { id, name, created_at, encrypted_blob: encryptedBlob, iv });
    res.status(201).json({ id, createdAt: created_at });
  }));

  // GET /api/simulations — solo metadati (il nome NON è cifrato: avvisare in UI).
  r.get('/simulations', ah(async (req, res) => {
    res.json(await store.listSimulations(req.userId));
  }));

  // GET /api/simulations/:id — il blob cifrato di una simulazione salvata.
  r.get('/simulations/:id', ah(async (req, res) => {
    const sim = await store.getSimulation(req.userId, req.params.id);
    if (!sim) return res.status(404).json({ error: 'non trovata' });
    res.json(sim);
  }));

  return r;
}
