/** Applica il colore del workspace attivo a tutta l'app (sfondo pieno tinto + accento),
 *  consapevole di tema chiaro/scuro. Reagisce al cambio workspace e al toggle del tema. */
import { useEffect, useState } from 'react';
import { useData } from '../lib/data.tsx';
import { currentTheme } from '../lib/theme.ts';
import { workspacePalette, CONSOLIDATO_COLOR, DEFAULT_WORKSPACE } from '../lib/workspaces.ts';

export function ThemeController() {
  const { workspaces, activeWorkspace, isConsolidato } = useData();
  const [mode, setMode] = useState(currentTheme());

  useEffect(() => {
    const onTheme = () => setMode(currentTheme());
    window.addEventListener('kp-theme', onTheme);
    // reagisce anche al cambio di preferenza di sistema se l'utente non ha forzato
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener?.('change', onTheme);
    return () => {
      window.removeEventListener('kp-theme', onTheme);
      mq.removeEventListener?.('change', onTheme);
    };
  }, []);

  useEffect(() => {
    const color = isConsolidato
      ? CONSOLIDATO_COLOR
      : workspaces.find((w) => w.id === activeWorkspace)?.color ?? DEFAULT_WORKSPACE.color;
    const vars = workspacePalette(color, mode);
    const root = document.documentElement;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    // theme-color per la status bar del telefono
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', `rgb(${vars['--bg']})`);
  }, [workspaces, activeWorkspace, isConsolidato, mode]);

  return null;
}
