/** Genera il report PDF in locale dal risultato corrente. Compressione selezionabile. */
import { useRef, useState } from 'react';
import { useData } from '../lib/data.tsx';
import { generateReport, type Compression } from '../lib/pdfReport.ts';
import type { SimulationOutput } from '../engine/types.ts';

const LABELS: Record<Compression, string> = { none: 'Nessuna', balanced: 'Bilanciata', max: 'Massima' };
const HINTS: Record<Compression, string> = {
  none: 'file più grande, massima fedeltà',
  balanced: 'consigliata — leggero e nitido',
  max: 'file più piccolo possibile',
};

export function ReportButton({ output, horizon }: { output: SimulationOutput; horizon: number }) {
  const { data, workspaces, activeWorkspace } = useData();
  const ws = workspaces.find((w) => w.id === activeWorkspace);
  const [compression, setCompression] = useState<Compression>('balanced');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const gen = async () => {
    if (!data) return;
    setBusy(true);
    try {
      // lasciamo respirare la UI prima del lavoro sincrono
      await new Promise((r) => setTimeout(r, 20));
      const generatedAt = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
      const doc = generateReport(data, output, horizon, {
        compression,
        workspaceName: ws?.name ?? 'Personale',
        workspaceColor: ws?.color ?? '#22cee9',
        generatedAt,
      });
      const safe = (ws?.name ?? 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const stamp = new Date().toISOString().slice(0, 10);
      doc.save(`k-prevention-${safe || 'report'}-${stamp}.pdf`);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button className="btn-ghost text-sm" onClick={() => setOpen((o) => !o)} title="Esporta un report PDF professionale, generato in locale">
        📄 Report PDF
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl p-3 shadow-xl" style={{ background: 'rgb(var(--panel))', border: '1px solid rgb(var(--border))' }}>
          <div className="mb-2 text-xs font-semibold">Compressione</div>
          <div className="space-y-1">
            {(['none', 'balanced', 'max'] as Compression[]).map((c) => (
              <label key={c} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5" style={compression === c ? { background: 'rgb(var(--panel-2))' } : undefined}>
                <input type="radio" name="compression" className="mt-0.5" checked={compression === c} onChange={() => setCompression(c)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{LABELS[c]}</span>
                  <span className="block text-[11px]" style={{ color: 'rgb(var(--text-dim))' }}>{HINTS[c]}</span>
                </span>
              </label>
            ))}
          </div>
          <button className="btn-primary mt-3 w-full text-sm" disabled={busy} onClick={gen}>
            {busy ? 'Genero…' : 'Genera PDF'}
          </button>
          <p className="mt-2 text-[10px]" style={{ color: 'rgb(var(--text-dim))' }}>
            Testo ricercabile, grafici vettoriali, tutto in locale: i dati non lasciano il dispositivo.
          </p>
        </div>
      )}
    </div>
  );
}
