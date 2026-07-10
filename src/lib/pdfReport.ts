/**
 * Report PDF professionale generato interamente in locale nel browser.
 * Testo RICERCABILE (vero testo, non immagini), grafici VETTORIALI disegnati dai dati
 * della simulazione (nessuno screenshot), compressione selezionabile. I dati non lasciano
 * il dispositivo. Formattazione in stile app.
 */
import { jsPDF } from 'jspdf';
import type { SimulationOutput } from '../engine/types.ts';
import type { UserData } from './data.tsx';
import { fmtEUR, fmtPct, fmtNum1, monthLabel } from './format.ts';

export type Compression = 'none' | 'balanced' | 'max';

export interface ReportOptions {
  compression: Compression;
  workspaceName: string;
  workspaceColor: string;
  generatedAt: string; // ISO/leggibile, passato dal componente
}

function hexRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const INK: [number, number, number] = [24, 28, 38];
const DIM: [number, number, number] = [110, 120, 138];
const LINE: [number, number, number] = [222, 226, 234];
const RED: [number, number, number] = [220, 38, 38];

export function generateReport(data: UserData, out: SimulationOutput, horizon: number, opts: ReportOptions): jsPDF {
  const floatPrecision = opts.compression === 'max' ? 1 : opts.compression === 'balanced' ? 2 : 16;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: opts.compression !== 'none', floatPrecision });
  const accent = hexRgb(opts.workspaceColor);
  const W = 595.28;
  const M = 42; // margine
  let y = 0;

  const setInk = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const text = (s: string, x: number, yy: number, o?: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'center' | 'right'; maxWidth?: number }) => {
    doc.setFont('helvetica', o?.bold ? 'bold' : 'normal');
    doc.setFontSize(o?.size ?? 10);
    setInk(o?.color ?? INK);
    doc.text(s, x, yy, { align: o?.align ?? 'left', maxWidth: o?.maxWidth });
  };

  // ---- Intestazione con barra colore workspace ----
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, W, 6, 'F');
  y = 54;
  text('k-prevention', M, y, { size: 18, bold: true });
  text('Report di liquidità · simulazione Monte Carlo', M, y + 16, { size: 10, color: DIM });
  text(opts.workspaceName, W - M, y, { size: 12, bold: true, align: 'right', color: accent });
  text(opts.generatedAt, W - M, y + 15, { size: 9, align: 'right', color: DIM });
  y += 36;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 22;

  // ---- KPI principali ----
  const agg = out.aggregateResult;
  const cap = agg.capitalAtHorizon[String(horizon)];
  const kpis: [string, string][] = [
    ['Probabilità di rovina', fmtPct(agg.probabilityOfRuin)],
    [`Autonomia mediana`, `${fmtNum1(agg.expectedRunwayMonths.p50)} mesi`],
    [`Capitale mediano · ${horizon}m`, fmtEUR(cap?.p50 ?? 0)],
    ['Crediti oltre orizzonte', fmtEUR(agg.outstandingReceivables.p50)],
  ];
  const kw = (W - 2 * M) / 4;
  kpis.forEach(([label, val], i) => {
    const x = M + i * kw;
    text(label.toUpperCase(), x, y, { size: 7.5, color: DIM });
    text(val, x, y + 18, { size: 16, bold: true, color: i === 0 ? (agg.probabilityOfRuin >= 0.4 ? RED : accent) : INK });
  });
  y += 42;
  text(`su ${horizon} mesi · ${out.meta.iterations.toLocaleString('it-IT')} scenari simulati · seed ${out.meta.seed}`, M, y, { size: 8.5, color: DIM });
  y += 18;

  // ---- Fan chart (capitale cumulato) ----
  const months = out.monthlyResults.slice(0, horizon);
  const ruin = data.simulationConfig.ruinThresholdEUR;
  const plot = { x: M, y: y + 8, w: W - 2 * M, h: 190 };
  let vmin = Infinity, vmax = -Infinity;
  for (const m of months) { vmin = Math.min(vmin, m.cumulativeCapital.p10, ruin, 0); vmax = Math.max(vmax, m.cumulativeCapital.p90); }
  const pad = (vmax - vmin) * 0.06 || 1;
  vmin -= pad; vmax += pad;
  const sx = (i: number) => plot.x + (i / Math.max(1, months.length - 1)) * plot.w;
  const sy = (v: number) => plot.y + plot.h - ((v - vmin) / (vmax - vmin)) * plot.h;

  text('Capitale cumulato', plot.x, y, { size: 11, bold: true });
  text('banda p10–p90 · mediana', W - M, y, { size: 8.5, color: DIM, align: 'right' });
  // cornice
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5);
  doc.rect(plot.x, plot.y, plot.w, plot.h, 'S');
  // banda p10-p90 come poligono chiuso
  const bandTop = months.map((m, i) => [sx(i), sy(m.cumulativeCapital.p90)] as [number, number]);
  const bandBot = months.map((m, i) => [sx(i), sy(m.cumulativeCapital.p10)] as [number, number]).reverse();
  drawPolygon(doc, [...bandTop, ...bandBot], accent, 0.16);
  const bandTop2 = months.map((m, i) => [sx(i), sy(m.cumulativeCapital.p75)] as [number, number]);
  const bandBot2 = months.map((m, i) => [sx(i), sy(m.cumulativeCapital.p25)] as [number, number]).reverse();
  drawPolygon(doc, [...bandTop2, ...bandBot2], accent, 0.28);
  // linea mediana
  doc.setDrawColor(accent[0], accent[1], accent[2]); doc.setLineWidth(1.4);
  polyline(doc, months.map((m, i) => [sx(i), sy(m.cumulativeCapital.p50)] as [number, number]));
  // soglia di rovina
  doc.setDrawColor(RED[0], RED[1], RED[2]); doc.setLineWidth(0.8); doc.setLineDashPattern([3, 2], 0);
  doc.line(plot.x, sy(ruin), plot.x + plot.w, sy(ruin));
  doc.setLineDashPattern([], 0);
  // etichette assi
  text(fmtEUR(vmax), plot.x + 2, plot.y + 9, { size: 7, color: DIM });
  text(fmtEUR(vmin), plot.x + 2, plot.y + plot.h - 3, { size: 7, color: DIM });
  text(`soglia rovina ${fmtEUR(ruin)}`, plot.x + plot.w - 2, sy(ruin) - 3, { size: 7, color: RED, align: 'right' });
  text(monthLabel(months[0].date), plot.x, plot.y + plot.h + 11, { size: 7, color: DIM });
  text(monthLabel(months[months.length - 1].date), plot.x + plot.w, plot.y + plot.h + 11, { size: 7, color: DIM, align: 'right' });
  y = plot.y + plot.h + 30;

  // ---- Istogramma capitale finale ----
  const samples = out.samples.capitalAtHorizon[String(horizon)] ?? [];
  const hp = { x: M, y: y + 8, w: W - 2 * M, h: 150 };
  text(`Distribuzione del capitale a ${horizon} mesi`, hp.x, y, { size: 11, bold: true });
  text(`${samples.length.toLocaleString('it-IT')} scenari · in rosso sotto la soglia`, W - M, y, { size: 8.5, color: DIM, align: 'right' });
  drawHistogram(doc, samples, ruin, hp, accent);
  y = hp.y + hp.h + 26;

  // ---- Avvisi + assunzioni ----
  if (agg.activeFlags.length) {
    text('Avvisi attivi', M, y, { size: 11, bold: true });
    y += 15;
    text(agg.activeFlags.map((f) => '• ' + f.replace(/_/g, ' ')).join('    '), M, y, { size: 9, color: DIM, maxWidth: W - 2 * M });
    y += 22;
  }
  const f = data.taxModel.forfettario;
  text('Assunzioni del modello', M, y, { size: 11, bold: true });
  y += 15;
  const assumptions = [
    `Regime: ${data.taxModel.regime}${f?.aliquotaSostitutiva != null ? ` · aliquota ${f.aliquotaSostitutiva}%` : ''} · coeff. ${f?.coefficienteRedditivita ?? '—'}`,
    `Capitale iniziale ${fmtEUR(data.simulationConfig.initialCapital)} · soglia rovina ${fmtEUR(ruin)} · ${data.incomeStreams.filter((s) => s.enabled !== false).length} redditi · ${data.expenses.filter((e) => e.enabled !== false).length} spese`,
    `Convergenza: ${agg.convergence.converged ? 'raggiunta' : 'NON raggiunta (aumenta le iterazioni)'} · SE mediana ${fmtNum1(agg.convergence.standardErrorOfMedian)}`,
  ];
  assumptions.forEach((a) => { text(a, M, y, { size: 9, color: DIM, maxWidth: W - 2 * M }); y += 13; });

  // ---- Footer ----
  const fy = 812;
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5); doc.line(M, fy, W - M, fy);
  text('Generato in locale · i dati non lasciano il tuo dispositivo · uno strumento di esplorazione, non una previsione.', M, fy + 12, { size: 7.5, color: DIM });
  text('k-prevention', W - M, fy + 12, { size: 7.5, color: DIM, align: 'right' });

  return doc;
}

function polyline(doc: jsPDF, pts: [number, number][]) {
  for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
}

function drawPolygon(doc: jsPDF, pts: [number, number][], color: [number, number, number], alpha: number) {
  if (pts.length < 3) return;
  // jsPDF non ha alpha diretto sui path senza GState; simuliamo schiarendo il colore su bianco.
  const mix = (c: number) => Math.round(255 - (255 - c) * alpha);
  doc.setFillColor(mix(color[0]), mix(color[1]), mix(color[2]));
  const start = pts[0];
  const segs = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]);
  doc.lines(segs, start[0], start[1], [1, 1], 'F', true);
}

function drawHistogram(doc: jsPDF, samples: number[], ruin: number, box: { x: number; y: number; w: number; h: number }, accent: [number, number, number]) {
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.5);
  doc.rect(box.x, box.y, box.w, box.h, 'S');
  if (!samples.length) return;
  const bins = 48;
  let mn = Infinity, mx = -Infinity;
  for (const v of samples) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (mn === mx) mx = mn + 1;
  const bw = (mx - mn) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of samples) { let idx = Math.floor((v - mn) / bw); if (idx >= bins) idx = bins - 1; if (idx < 0) idx = 0; counts[idx]++; }
  const cmax = Math.max(...counts) || 1;
  const barW = box.w / bins;
  for (let i = 0; i < bins; i++) {
    const x0 = mn + i * bw;
    const below = x0 + bw <= ruin;
    const bh = (counts[i] / cmax) * (box.h - 6);
    if (below) doc.setFillColor(RED[0], RED[1], RED[2]);
    else doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(box.x + i * barW + 0.4, box.y + box.h - bh, Math.max(0.6, barW - 0.8), bh, 'F');
  }
  // linea soglia
  const rx = box.x + ((ruin - mn) / (mx - mn)) * box.w;
  if (rx >= box.x && rx <= box.x + box.w) {
    doc.setDrawColor(RED[0], RED[1], RED[2]); doc.setLineWidth(0.8); doc.setLineDashPattern([3, 2], 0);
    doc.line(rx, box.y, rx, box.y + box.h); doc.setLineDashPattern([], 0);
  }
  doc.setTextColor(DIM[0], DIM[1], DIM[2]); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text(fmtEUR(mn), box.x, box.y + box.h + 10);
  doc.text(fmtEUR(mx), box.x + box.w, box.y + box.h + 10, { align: 'right' });
}
