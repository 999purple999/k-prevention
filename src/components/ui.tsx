/** Atomi UI condivisi: logo, badge E2E, toggle tema, spinner, tooltip d'aiuto. */
import { useState, type ReactNode } from 'react';
import { toggleTheme, currentTheme } from '../lib/theme.ts';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22cee9" />
            <stop offset="1" stopColor="#088cad" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="rgb(var(--panel-2))" stroke="rgb(var(--border-strong))" />
        <path d="M8 44 C22 40 30 30 56 14 L56 26 C34 34 24 42 8 50 Z" fill="url(#lg)" opacity="0.32" />
        <path d="M8 46 C22 44 32 36 56 22" fill="none" stroke="url(#lg)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="56" cy="22" r="3.5" fill="#22cee9" />
      </svg>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">
          k-<span style={{ color: 'rgb(var(--accent))' }}>prevention</span>
        </div>
      </div>
    </div>
  );
}

export function EncryptionBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
      style={{ background: 'rgb(16 185 129 / 0.10)', border: '1px solid rgb(16 185 129 / 0.25)', color: '#6ee7b7' }}
      title="Cifratura end-to-end: la chiave deriva dalla tua password e non lascia mai questo dispositivo."
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      {compact ? 'E2E' : 'Cifrato end-to-end · il server non può leggere questi dati'}
    </div>
  );
}

export function ThemeToggle() {
  const [t, setT] = useState(currentTheme());
  return (
    <button
      className="btn-ghost h-9 w-9 !px-0"
      onClick={() => setT(toggleTheme())}
      title={t === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
      aria-label="Cambia tema"
    >
      {t === 'dark' ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`spin h-4 w-4 ${className}`} fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}

export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: 'rgb(var(--panel-2))', border: '1px solid rgb(var(--border-strong))', color: 'rgb(var(--text-dim))' }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        aria-label="Aiuto"
      >
        ?
      </button>
      {open && (
        <span
          className="panel absolute left-1/2 top-6 z-30 w-64 -translate-x-1/2 rounded-lg p-3 text-xs font-normal normal-case tracking-normal"
          style={{ color: 'rgb(var(--text-dim))' }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2"
    >
      <span
        className="relative h-5 w-9 rounded-full transition"
        style={{ background: checked ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: checked ? '18px' : '2px' }}
        />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </button>
  );
}

export function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="panel-flat p-4">
      <div className="label flex items-center gap-1.5">
        {label}
        {hint && <Help text={hint} />}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tnum tracking-tight">{children}</div>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'rgb(var(--text-dim))' }}>
        {children}
      </h2>
      {right}
    </div>
  );
}
