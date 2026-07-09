import { NavLink, useNavigate } from 'react-router-dom';
import { type ReactNode } from 'react';
import { useSession } from '../lib/session.tsx';
import { useData } from '../lib/data.tsx';
import { Logo, ThemeToggle, EncryptionBadge } from './ui.tsx';
import { SyncBadge } from './SyncBadge.tsx';
import { InstallPrompt } from './InstallPrompt.tsx';
import { DEMO } from '../lib/demo.ts';

const nav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/registra', label: 'Registra' },
  { to: '/scenari', label: 'Scenari' },
  { to: '/import', label: 'Importa' },
  { to: '/settings', label: 'Impostazioni' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { logout } = useSession();
  const { data } = useData();
  const navigate = useNavigate();
  const name = data?.profile?.name ?? 'Utente';
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-20 border-b backdrop-blur-md" style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--bg) / 0.72)' }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    isActive ? 'text-[rgb(var(--text))]' : 'text-[rgb(var(--text-dim))] hover:text-[rgb(var(--text))]'
                  }`
                }
                style={({ isActive }: { isActive: boolean }) =>
                  isActive ? { background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border))' } : undefined
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden lg:block">
              <EncryptionBadge />
            </span>
            <SyncBadge />
            <ThemeToggle />
            <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3" style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border))' }}>
              <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-ink-950" style={{ background: 'linear-gradient(180deg,rgb(var(--accent)),rgb(var(--accent)/.8))' }}>
                {initials}
              </div>
              <span className="hidden text-sm font-medium sm:block">{name.split(' ')[0]}</span>
            </div>
            <button
              className="btn-ghost h-9"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Esci
            </button>
          </div>
        </div>
        {/* mobile nav */}
        <nav className="flex items-center gap-1 border-t px-4 py-2 md:hidden" style={{ borderColor: 'rgb(var(--border))' }}>
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium ${isActive ? 'text-[rgb(var(--text))]' : 'text-[rgb(var(--text-dim))]'}`}
              style={({ isActive }: { isActive: boolean }) => (isActive ? { background: 'rgb(var(--panel-2))' } : undefined)}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {DEMO && (
        <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
          <div className="rounded-xl px-4 py-2.5 text-center text-xs sm:text-left" style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)', color: 'rgb(var(--text-dim))' }}>
            <strong style={{ color: 'rgb(var(--accent))' }}>Demo pubblica</strong> · dati di esempio, tutto gira nel tuo browser (nessun backend). La versione completa gira su Google Cloud Run con cifratura end-to-end e account reali.
          </div>
        </div>
      )}
      <InstallPrompt />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>

      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6">
        <div className="divider mb-4" />
        <div className="flex flex-col items-start justify-between gap-2 text-xs sm:flex-row sm:items-center" style={{ color: 'rgb(var(--text-dim))' }}>
          <span>k-prevention · simulatore di liquidità Monte Carlo · uno strumento di esplorazione, non una previsione.</span>
          <span className="sm:hidden"><EncryptionBadge compact /></span>
        </div>
      </footer>
    </div>
  );
}
