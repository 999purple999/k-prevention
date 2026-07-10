/** Esegue l'analisi di sensibilità nel Web Worker (non blocca la UI), con progresso. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SimulationInput } from '../engine/types.ts';
import type { SensitivityRow } from '../engine/sensitivity.ts';

interface State {
  running: boolean;
  progress: number;
  baseRuin: number | null;
  rows: SensitivityRow[] | null;
  error: string | null;
}

export function useSensitivity() {
  const workerRef = useRef<Worker | null>(null);
  const runIdRef = useRef(0);
  const [state, setState] = useState<State>({ running: false, progress: 0, baseRuin: null, rows: null, error: null });

  useEffect(() => {
    const w = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (typeof m?.runId !== 'number' || m.runId !== runIdRef.current) return;
      if (m.type === 'sensitivity-progress') setState((s) => ({ ...s, progress: m.total ? m.done / m.total : 0 }));
      else if (m.type === 'sensitivity-result') setState({ running: false, progress: 1, baseRuin: m.result.baseRuin, rows: m.result.rows, error: null });
      else if (m.type === 'error') setState((s) => ({ ...s, running: false, error: m.message }));
    };
    w.addEventListener('message', onMsg);
    return () => { w.removeEventListener('message', onMsg); w.terminate(); };
  }, []);

  const run = useCallback((input: SimulationInput, iterations = 2500) => {
    const w = workerRef.current;
    if (!w) return;
    const runId = ++runIdRef.current;
    setState((s) => ({ ...s, running: true, progress: 0, error: null }));
    w.postMessage({ type: 'sensitivity', runId, input, iterations });
  }, []);

  return { ...state, run };
}
