import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session.tsx';
import { defaultUserData } from '../lib/data.tsx';
import { Logo, Spinner, ThemeToggle, EncryptionBadge } from '../components/ui.tsx';

type Mode = 'login' | 'register';

export function Login() {
  const { login, register, isUnlocked } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (isUnlocked) navigate('/dashboard', { replace: true });
  }, [isUnlocked, navigate]);
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(localStorage.getItem('kp_email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register' && password !== confirm) return setError('Le password non coincidono.');
    if (password.length < 8) return setError('La password deve avere almeno 8 caratteri.');
    setBusy(true);
    try {
      setStatus('Derivazione della chiave (PBKDF2, 600k iterazioni)…');
      if (mode === 'login') {
        await login(email.trim(), password, duration);
      } else {
        const base = defaultUserData(name.trim() || 'Nuovo utente');
        await register(email.trim(), password, {
          profile: base.profile,
          organicParameters: base.organicParameters,
          taxModel: base.taxModel,
          simulationConfig: base.simulationConfig,
          monteCarlo: base.monteCarlo,
          incomeStreams: base.incomeStreams,
          expenses: base.expenses,
        });
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di autenticazione');
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      {/* Brand / pitch */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex" style={{ borderRight: '1px solid rgb(var(--border))' }}>
        <div className="absolute inset-0 -z-10" style={{ background: 'radial-gradient(700px 500px at 30% 10%, rgb(var(--accent)/.14), transparent 60%)' }} />
        <Logo />
        <div className="max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Vedi il <span style={{ color: 'rgb(var(--accent))' }}>buco di cassa</span> prima di caderci dentro.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'rgb(var(--text-dim))' }}>
            Una proiezione non è una linea: è un fascio di traiettorie. k-prevention simula migliaia di futuri della tua
            liquidità da libero professionista — con ritardi di pagamento, mesi storti, imprevisti a coda pesante e le
            scadenze fiscali italiane nei mesi giusti — e ti dice l'unico numero che conta: la probabilità di rovina.
          </p>
          <ul className="mt-6 space-y-2 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
            {['Monte Carlo seminato e riproducibile', 'Regime forfettario e ordinario', 'Cifratura end-to-end: il server è cieco'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--accent))' }} /> {t}
              </li>
            ))}
          </ul>
        </div>
        <EncryptionBadge />
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Logo />
            <ThemeToggle />
          </div>
          <div className="mb-6 hidden justify-end lg:flex">
            <ThemeToggle />
          </div>

          <div className="panel p-6 sm:p-7 animate-fade-in">
            <h2 className="text-xl font-semibold tracking-tight">{mode === 'login' ? 'Bentornato' : 'Crea il tuo account'}</h2>
            <p className="mt-1 text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
              {mode === 'login' ? 'Accedi per aprire il tuo modello.' : 'La password cifra i tuoi dati: sceglila con cura, non è recuperabile.'}
            </p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              {mode === 'register' && (
                <div>
                  <label className="label mb-1">Nome</label>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e cognome" autoComplete="name" />
                </div>
              )}
              <div>
                <label className="label mb-1">Email</label>
                <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.it" autoComplete="username" />
              </div>
              <div>
                <label className="label mb-1">Password</label>
                <input className="field" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </div>
              {mode === 'register' && (
                <div>
                  <label className="label mb-1">Conferma password</label>
                  <input className="field" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••••" autoComplete="new-password" />
                </div>
              )}
              {mode === 'login' && (
                <div>
                  <label className="label mb-1">Resta connesso per</label>
                  <select className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    <option value={30}>1 mese</option>
                    <option value={90}>3 mesi</option>
                    <option value={180}>6 mesi</option>
                    <option value={365}>1 anno</option>
                    <option value={0}>Fino a revoca esplicita</option>
                  </select>
                </div>
              )}

              {error && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: 'rgb(239 68 68 / 0.12)', border: '1px solid rgb(239 68 68 / 0.3)', color: '#fca5a5' }}>
                  {error}
                </div>
              )}

              <button className="btn-primary w-full" disabled={busy}>
                {busy ? <Spinner /> : null}
                {busy ? status || 'Un momento…' : mode === 'login' ? 'Accedi' : 'Registrati'}
              </button>
            </form>

            <div className="mt-5 text-center text-sm" style={{ color: 'rgb(var(--text-dim))' }}>
              {mode === 'login' ? (
                <>Non hai un account?{' '}<button className="font-medium" style={{ color: 'rgb(var(--accent))' }} onClick={() => setMode('register')}>Registrati</button></>
              ) : (
                <>Hai già un account?{' '}<button className="font-medium" style={{ color: 'rgb(var(--accent))' }} onClick={() => setMode('login')}>Accedi</button></>
              )}
            </div>
          </div>

          <p className="mt-4 text-center text-xs" style={{ color: 'rgb(var(--text-dim))' }}>
            La password non lascia mai il browser: deriviamo localmente una prova d'accesso e una chiave di cifratura separate.
          </p>
        </div>
      </div>
    </div>
  );
}
