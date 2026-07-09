/**
 * Web Worker che esegue la simulazione fuori dal thread principale.
 * Riceve l'input GIÀ in chiaro (la decifratura avviene nel main thread) e restituisce
 * l'output. NON deve MAI fare `fetch()`: se lo facesse, farebbe uscire dati non cifrati.
 * Ogni messaggio riporta il `runId` così il main thread può scartare i risultati obsoleti.
 */
import { simulate } from '../engine/simulate.ts';
import type { SimulationInput } from '../engine/types.ts';

interface RunMessage {
  type: 'run';
  runId: number;
  input: SimulationInput;
  iterationsOverride?: number;
}

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const msg = e.data;
  if (msg?.type !== 'run') return;
  const runId = msg.runId;
  const t0 = performance.now();
  try {
    const output = simulate(msg.input, {
      iterationsOverride: msg.iterationsOverride,
      onProgress: (done, total) => self.postMessage({ type: 'progress', runId, done, total }),
    });
    output.meta.runtimeMs = Math.round(performance.now() - t0);
    self.postMessage({ type: 'result', runId, output });
  } catch (err) {
    self.postMessage({ type: 'error', runId, message: err instanceof Error ? err.message : String(err) });
  }
};
