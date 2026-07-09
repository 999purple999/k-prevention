/** Tema chiaro/scuro: default automatico via prefers-color-scheme, con override manuale. */
const KEY = 'kp_theme';
export type Theme = 'dark' | 'light';

export function initTheme() {
  apply(currentTheme());
}

export function currentTheme(): Theme {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function apply(t: Theme) {
  document.documentElement.classList.toggle('light', t === 'light');
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(KEY, next);
  apply(next);
  return next;
}
