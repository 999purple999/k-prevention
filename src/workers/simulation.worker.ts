/**
 * Web Worker che esegue la simulazione fuori dal thread principale.
 * Riceve l'input GIÀ in chiaro (la decifratura avviene nel main thread) e restituisce
 * l'output. NON deve MAI fare `fetch()`: se lo facesse, farebbe uscire dati non cifrati.
 */
import { simulate } from '../engine/simulate.ts';
import type { SimulationInput } from '../engine/types.ts';

interface RunMessage {
  type: 'run';
  input: SimulationInput;
  iterationsOverride?: number;
}

self.onmessage = (e: MessageEvent<RunMessage>) => {
  const msg = e.data;
  if (msg?.type !== 'run') return;
  const t0 = performance.now();
  try {
    const output = simulate(msg.input, {
      iterationsOverride: msg.iterationsOverride,
      onProgress: (done, total) => self.postMessage({ type: 'progress', done, total }),
    });
    output.meta.runtimeMs = Math.round(performance.now() - t0);
    self.postMessage({ type: 'result', output });
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
