/**
 * Contesto di sessione. La DEK vive SOLO in memoria (mai in localStorage/IndexedDB):
 * al refresh della pagina si perde e l'utente reinserisce la password. È la scelta più
 * sicura tra le due descritte nel README ("Compromesso sulla persistenza della chiave").
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import {
  deriveAuthProof,
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptData,
  decryptData,
  randomSaltB64,
  aadFor,
} from './crypto.ts';
import { api } from './api.ts';
import { DEMO } from './demo.ts';

interface SessionState {
  userId: string | null;
  email: string | null;
  dek: CryptoKey | null;
}

interface SessionContextValue extends SessionState {
  isUnlocked: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, initialData?: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  encryptFor: (dataType: string, obj: unknown) => Promise<{ ciphertext: string; iv: string }>;
  decryptFor: <T>(dataType: string, ciphertext: string, iv: string) => Promise<T>;
}

const Ctx = createContext<SessionContextValue | null>(null);
const EMAIL_KEY = 'kp_email';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(
    DEMO
      ? { userId: 'demo-user', email: 'francesco.pernice@k-prevention.app', dek: null }
      : { userId: null, email: localStorage.getItem(EMAIL_KEY), dek: null },
  );

  const login = useCallback(async (email: string, password: string) => {
    const { authSalt, kekSalt } = await api.salts(email);
    const authProof = await deriveAuthProof(password, authSalt);
    const { userId, wrappedDek, dekIv } = await api.login(email, authProof);
    const kek = await deriveKEK(password, kekSalt);
    const dek = await unwrapDEK(wrappedDek, dekIv, kek); // fallisce se la password è sbagliata
    localStorage.setItem(EMAIL_KEY, email);
    setState({ userId, email, dek });
  }, []);

  const register = useCallback(async (email: string, password: string, initialData?: Record<string, unknown>) => {
    const authSalt = randomSaltB64();
    const kekSalt = randomSaltB64(); // DIVERSO da authSalt
    const authProof = await deriveAuthProof(password, authSalt);
    const kek = await deriveKEK(password, kekSalt);
    const dek = await generateDEK();
    const { wrappedDek, iv: dekIv } = await wrapDEK(dek, kek);
    const { userId } = await api.register({ email, authProof, authSalt, kekSalt, wrappedDek, dekIv });
    localStorage.setItem(EMAIL_KEY, email);
    setState({ userId, email, dek });
    if (initialData) {
      for (const [type, obj] of Object.entries(initialData)) {
        const { ciphertext, iv } = await encryptData(obj, dek, aadFor(userId, type));
        await api.putData(type, ciphertext, iv);
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState((s) => ({ userId: null, email: s.email, dek: null }));
    }
  }, []);

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      if (!state.userId || !state.email || !state.dek) throw new Error('sessione non attiva');
      // Deriva il vecchio authProof per l'autorizzazione lato server.
      const { authSalt: oldAuthSalt } = await api.salts(state.email);
      const oldAuthProof = await deriveAuthProof(oldPassword, oldAuthSalt);
      // Nuovi sali + nuova KEK; riavvolgi la STESSA DEK (nessun dato viene ri-cifrato).
      const newAuthSalt = randomSaltB64();
      const newKekSalt = randomSaltB64();
      const newAuthProof = await deriveAuthProof(newPassword, newAuthSalt);
      const newKek = await deriveKEK(newPassword, newKekSalt);
      const { wrappedDek, iv: dekIv } = await wrapDEK(state.dek, newKek);
      await api.changePassword({
        oldAuthProof,
        newAuthProof,
        newAuthSalt,
        newKekSalt,
        newWrappedDek: wrappedDek,
        newDekIv: dekIv,
      });
    },
    [state.userId, state.email, state.dek],
  );

  const encryptFor = useCallback(
    async (dataType: string, obj: unknown) => {
      if (!state.userId || !state.dek) throw new Error('sessione non attiva');
      return encryptData(obj, state.dek, aadFor(state.userId, dataType));
    },
    [state.userId, state.dek],
  );

  const decryptFor = useCallback(
    async <T,>(dataType: string, ciphertext: string, iv: string): Promise<T> => {
      if (!state.userId || !state.dek) throw new Error('sessione non attiva');
      return decryptData<T>(ciphertext, iv, state.dek, aadFor(state.userId, dataType));
    },
    [state.userId, state.dek],
  );

  const value: SessionContextValue = {
    ...state,
    isUnlocked: DEMO || !!state.dek,
    login,
    register,
    logout,
    changePassword,
    encryptFor,
    decryptFor,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession fuori dal SessionProvider');
  return ctx;
}
