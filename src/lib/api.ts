/** Client API tipizzato. Tutte le chiamate usano il cookie di sessione httpOnly. */

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let msg = `Errore ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export interface Salts {
  authSalt: string;
  kekSalt: string;
}
export interface AuthResult {
  userId: string;
  wrappedDek: string;
  dekIv: string;
}
export interface StoredBlob {
  encryptedBlob: string;
  iv: string;
  lastModified: number;
}
export interface StoredBlobWithType extends StoredBlob {
  dataType: string;
}
export interface SimulationMeta {
  id: string;
  name: string;
  createdAt: number;
}

export const api = {
  salts: (email: string) => req<Salts>('POST', '/api/auth/salts', { email }),
  register: (b: { email: string; authProof: string; authSalt: string; kekSalt: string; wrappedDek: string; dekIv: string }) =>
    req<{ userId: string }>('POST', '/api/auth/register', b),
  login: (email: string, authProof: string) => req<AuthResult>('POST', '/api/auth/login', { email, authProof }),
  session: () => req<AuthResult>('GET', '/api/auth/session'),
  logout: () => req<{ ok: boolean }>('POST', '/api/auth/logout'),
  changePassword: (b: {
    oldAuthProof: string;
    newAuthProof: string;
    newAuthSalt: string;
    newKekSalt: string;
    newWrappedDek: string;
    newDekIv: string;
  }) => req<{ ok: boolean }>('PATCH', '/api/auth/password', b),

  getAllData: () => req<StoredBlobWithType[]>('GET', '/api/data'),
  getData: (type: string) => req<StoredBlob>('GET', `/api/data/${type}`),
  putData: (type: string, encryptedBlob: string, iv: string) =>
    req<{ ok: boolean; lastModified: number }>('PUT', `/api/data/${type}`, { encryptedBlob, iv }),
  deleteData: (type: string) => req<{ ok: boolean }>('DELETE', `/api/data/${type}`),

  saveSimulation: (name: string, encryptedBlob: string, iv: string) =>
    req<{ id: string; createdAt: number }>('POST', '/api/simulations', { name, encryptedBlob, iv }),
  listSimulations: () => req<SimulationMeta[]>('GET', '/api/simulations'),
  getSimulation: (id: string) => req<StoredBlob & { id: string; name: string; createdAt: number }>('GET', `/api/simulations/${id}`),
};
