/** Indicatore di sincronizzazione: online/offline e stato di salvataggio. */
import { useData } from '../lib/data.tsx';

export function SyncBadge() {
  const { online, syncing, savingType } = useData();
  let color = '#34d399';
  let label = 'sincronizzato';
  let pulse = false;
  if (!online) {
    color = '#94a3b8';
    label = 'offline';
  } else if (syncing || savingType) {
    color = '#f59e0b';
    label = 'sincronizzo…';
    pulse = true;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]" style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border))', color: 'rgb(var(--text-dim))' }} title={online ? 'Sincronizzato tra i tuoi dispositivi' : 'Offline: le modifiche partiranno alla riconnessione'}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: pulse ? `0 0 0 3px ${color}33` : undefined }} />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
