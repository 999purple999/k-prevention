/** Multi-workspace LIBERI: quante "istanze" vuoi (personale, azienda, fondi, immobili,
 *  un progetto…), ognuna con nome + emoji + COLORE tuoi. Nessuna categoria hard-coded.
 *
 *  Backward-compatible: il workspace "default" usa i tipi di dato NUDI (dati esistenti);
 *  gli altri usano `w_<id>_<tipo>`. Il colore del workspace attivo tinge tutta l'app. */
export interface Workspace {
  id: string;
  name: string;
  emoji: string;
  color: string; // hex, es. "#22cee9"
}

export const DEFAULT_WORKSPACE: Workspace = { id: 'default', name: 'Personale', emoji: '👤', color: '#22cee9' };
export const CONSOLIDATO_ID = '__all__';
export const CONSOLIDATO_COLOR = '#8b93a7';

/** Palette curata (leggibile in dark e light) per la scelta rapida del colore. */
export const WORKSPACE_COLORS = ['#22cee9', '#34d399', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc'];
export const WORKSPACE_EMOJIS = ['👤', '🏢', '📈', '🏠', '🎨', '🎸', '💼', '🚀', '🌱', '🧾', '🍸', '⚙️', '💡', '🛠️', '🎯', '🏦'];

// ---------------------------------------------------------------------------
// Namespacing dei tipi di dato per workspace
// ---------------------------------------------------------------------------
export function typeForWs(wsId: string, baseType: string): string {
  return wsId === 'default' ? baseType : `w_${wsId}_${baseType}`;
}

export function baseTypeForWs(wsId: string, fullType: string, baseTypes: readonly string[]): string | null {
  if (wsId === 'default') return baseTypes.includes(fullType) ? fullType : null;
  const p = `w_${wsId}_`;
  if (!fullType.startsWith(p)) return null;
  const base = fullType.slice(p.length);
  return baseTypes.includes(base) ? base : null;
}

/** Normalizza una lista di workspace (retro-compat: assicura emoji+color). */
export function normalizeWorkspaces(list: Partial<Workspace>[]): Workspace[] {
  return list.map((w, i) => ({
    id: String(w.id),
    name: (w.name || 'Workspace').toString(),
    emoji: w.emoji || (w.id === 'default' ? DEFAULT_WORKSPACE.emoji : WORKSPACE_EMOJIS[(i + 1) % WORKSPACE_EMOJIS.length]),
    color: w.color || (w.id === 'default' ? DEFAULT_WORKSPACE.color : WORKSPACE_COLORS[(i + 1) % WORKSPACE_COLORS.length]),
  }));
}

export function newWorkspaceId(): string {
  let s = '';
  const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buf = new Uint8Array(8);
  globalThis.crypto.getRandomValues(buf);
  for (let i = 0; i < 8; i++) s += alpha[buf[i] % alpha.length];
  return s;
}

// ---------------------------------------------------------------------------
// Colore → palette CSS (sfondo pieno tinto, accento), consapevole di light/dark
// ---------------------------------------------------------------------------
function hexToHsl(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s, l];
}

function hslToRgbTriplet(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
}

/** Variabili CSS (formato "R G B") derivate dal colore del workspace, per il tema attivo. */
export function workspacePalette(color: string, mode: 'dark' | 'light'): Record<string, string> {
  const [h, s] = hexToHsl(color);
  if (mode === 'dark') {
    return {
      '--accent': hslToRgbTriplet(h, Math.min(0.85, s), 0.62),
      '--bg': hslToRgbTriplet(h, Math.min(0.5, s * 0.6), 0.055),
      '--bg-soft': hslToRgbTriplet(h, Math.min(0.45, s * 0.55), 0.09),
      '--panel': hslToRgbTriplet(h, Math.min(0.4, s * 0.5), 0.135),
      '--panel-2': hslToRgbTriplet(h, Math.min(0.36, s * 0.45), 0.175),
    };
  }
  return {
    '--accent': hslToRgbTriplet(h, Math.min(0.9, s), 0.4),
    '--bg': hslToRgbTriplet(h, Math.min(0.45, s * 0.55), 0.955),
    '--bg-soft': hslToRgbTriplet(h, Math.min(0.4, s * 0.4), 0.985),
    '--panel': hslToRgbTriplet(h, Math.min(0.35, s * 0.35), 1),
    '--panel-2': hslToRgbTriplet(h, Math.min(0.4, s * 0.4), 0.965),
  };
}
