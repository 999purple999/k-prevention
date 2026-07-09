/** Prompt d'installazione PWA. Cattura beforeinstallprompt (Android/desktop) e mostra un
 *  pulsante; su iOS mostra il suggerimento "Aggiungi a Home dal menu Condividi". */
import { useEffect, useState } from 'react';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('kp_install_dismissed') === '1');
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', onBIP);
    return () => window.removeEventListener('beforeinstallprompt', onBIP);
  }, []);

  if (dismissed || isStandalone()) return null;
  const showIOS = isIOS() && !isStandalone();
  if (!deferred && !showIOS) return null;

  const dismiss = () => {
    setDismissed(true);
    localStorage.setItem('kp_install_dismissed', '1');
  };

  return (
    <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6">
      <div className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm" style={{ background: 'rgb(var(--accent) / 0.08)', border: '1px solid rgb(var(--accent) / 0.25)' }}>
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8"><path d="M12 16V4M8 12l4 4 4-4M4 20h16" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="flex-1" style={{ color: 'rgb(var(--text-dim))' }}>
          {deferred ? (
            <>Installa k-prevention sul dispositivo: sempre a portata di mano, anche offline.</>
          ) : iosHint ? (
            <>Tocca <strong>Condividi</strong> ⬆️ poi <strong>«Aggiungi a Home»</strong> per installarla.</>
          ) : (
            <>Aggiungi k-prevention alla schermata Home per usarla come un'app.</>
          )}
        </div>
        {deferred ? (
          <button className="btn-primary !py-1.5 text-xs" onClick={async () => { await deferred.prompt(); await deferred.userChoice; setDeferred(null); }}>Installa</button>
        ) : (
          <button className="btn-ghost !py-1.5 text-xs" onClick={() => setIosHint(true)}>Come?</button>
        )}
        <button className="text-lg leading-none" style={{ color: 'rgb(var(--text-dim))' }} onClick={dismiss} aria-label="Chiudi">×</button>
      </div>
    </div>
  );
}
