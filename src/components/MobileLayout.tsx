import { NavLink, useNavigate } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useSession } from '../lib/session.tsx';
import { useData } from '../lib/data.tsx';
import { Logo, ThemeToggle } from './ui.tsx';
import { SyncBadge } from './SyncBadge.tsx';
import { InstallPrompt } from './InstallPrompt.tsx';
import { DEMO } from '../lib/demo.ts';

const tabs = [
  { to: '/dashboard', label: 'Rischio', icon: 'M4 18l5-6 4 4 7-9', kind: 'line' },
  { to: '/registra', label: 'Registra', icon: 'M12 5v14M5 12h14', kind: 'plus' },
  { to: '/scenari', label: 'Scenari', icon: 'M6 3v12a3 3 0 0 0 3 3h6M18 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', kind: 'branch' },
  { to: '/settings', label: 'Modifica', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1L14.5 2h-4l-.3 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.3 2.8h4l.3-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z', kind: 'gear' },
];

export function MobileLayout({ children }: { children: ReactNode }) {
  const { logout } = useSession();
  const { data } = useData();
  const navigate = useNavigate();
  const name = data?.profile?.name?.split(' ')[0] ?? 'Utente';

  return (
    <div className="min-h-full pb-20">
      <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--bg) / 0.8)' }}>
        <div className="flex h-14 items-center gap-3 px-4">
          <Logo />
          <div className="ml-auto flex items-center gap-2">
            <SyncBadge />
            <ThemeToggle />
            <button className="btn-ghost h-9 !px-3 text-xs" onClick={async () => { await logout(); navigate('/login'); }}>Esci</button>
          </div>
        </div>
      </header>

      {DEMO && (
        <div className="px-4 pt-3">
          <div className="rounded-xl px-3 py-2 text-center text-xs" style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)', color: 'rgb(var(--text-dim))' }}>
            <strong style={{ color: 'rgb(var(--accent))' }}>Demo</strong> · dati d'esempio, nessun backend.
          </div>
        </div>
      )}
      <InstallPrompt />

      <main className="px-4 py-5">
        <div className="mb-1 text-xs" style={{ color: 'rgb(var(--text-dim))' }}>Ciao, {name}</div>
        {children}
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur-md" style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--bg) / 0.92)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className="flex flex-1 flex-col items-center gap-0.5 py-2.5"
              style={({ isActive }: { isActive: boolean }) => ({ color: isActive ? 'rgb(var(--accent))' : 'rgb(var(--text-dim))' })}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {t.kind === 'branch' ? <path d={t.icon} /> : <path d={t.icon} />}
              </svg>
              <span className="text-[10px] font-medium">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
