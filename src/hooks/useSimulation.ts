/** Hook che pilota il Web Worker della simulazione (nessuna simulate() in un componente). */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationInput, SimulationOutput } from '../engine/types.ts';

export type RunMode = 'preview' | 'full';

interface State {
  output: SimulationOutput | null;
  mode: RunMode | null;
  running: boolean;
  progress: number; // 0..1
  error: string | null;
}

const PREVIEW_ITERATIONS = 200;

export function useSimulation() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<State>({ output: null, mode: null, running: false, progress: 0, error: null });
  const runIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const run = useCallback((input: SimulationInput, mode: RunMode = 'full') => {
    const worker = workerRef.current;
    if (!worker) return;
    const myRun = ++runIdRef.current;
    setState((s) => ({ ...s, running: true, progress: 0, error: null, mode }));

    const onMessage = (e: MessageEvent) => {
      if (myRun !== runIdRef.current) return; // una run più recente ha vinto
      const msg = e.data;
      if (msg.type === 'progress') {
        setState((s) => ({ ...s, progress: msg.total ? msg.done / msg.total : 0 }));
      } else if (msg.type === 'result') {
        setState({ output: msg.output, mode, running: false, progress: 1, error: null });
        worker.removeEventListener('message', onMessage);
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, running: false, error: msg.message }));
        worker.removeEventListener('message', onMessage);
      }
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'run', input, iterationsOverride: mode === 'preview' ? PREVIEW_ITERATIONS : undefined });
  }, []);

  const cancel = useCallback(() => {
    // Ricrea il worker per interrompere una run in corso.
    runIdRef.current++;
    workerRef.current?.terminate();
    const worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, run, cancel };
}
