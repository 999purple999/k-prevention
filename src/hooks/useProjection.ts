/**
 * Esegue UNA simulazione all'orizzonte lungo (fino a 30 anni) nel Web Worker. Tutte le
 * finestre temporali (1/5/10/20/30 anni) sono poi fette dello STESSO run: comparabili,
 * perché condividono seed ed estrazioni. Non blocca la UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationInput, SimulationOutput } from '../engine/types.ts';

interface State {
  running: boolean;
  progress: number;
  output: SimulationOutput | null;
  error: string | null;
}

export function useProjection() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const [state, setState] = useState<State>({ running: false, progress: 0, output: null, error: null });

  useEffect(() => {
    const w = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (typeof m?.runId !== 'number' || m.runId !== runIdRef.current) return;
      if (m.type === 'progress') setState((s) => ({ ...s, progress: m.total ? m.done / m.total : 0 }));
      else if (m.type === 'result') setState({ running: false, progress: 1, output: m.output, error: null });
      else if (m.type === 'error') setState((s) => ({ ...s, running: false, error: m.message }));
    };
    w.addEventListener('message', onMsg);
    return () => { w.removeEventListener('message', onMsg); w.terminate(); };
  }, []);

  /** Corre all'orizzonte massimo di `horizons` (es. [12,60,120,240,360]). */
  const run = useCallback((input: SimulationInput, horizons: number[], iterations: number) => {
    const w = workerRef.current;
    if (!w) return;
    const runId = ++runIdRef.current;
    const patched: SimulationInput = {
      ...input,
      simulationConfig: { ...input.simulationConfig, simulationHorizons: horizons },
    };
    setState((s) => ({ ...s, running: true, progress: 0, error: null }));
    w.postMessage({ type: 'run', runId, input: patched, iterationsOverride: iterations });
  }, []);

  return { ...state, run };
}
