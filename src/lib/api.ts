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
    let payload: unknown;
    try {
      payload = await res.json();
      if ((payload as { error?: string })?.error) msg = (payload as { error: string }).error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status, payload);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
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
  sessionDurationDays?: number;
}

export interface DeviceSession {
  id: string;
  device: string | null;
  createdAt: number;
  lastSeen: number;
  expiresAt: number | null;
  revoked: boolean;
  expired: boolean;
  current: boolean;
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
  workspaceId?: string;
  createdAt: number;
  updatedAt: number;
  parentId: string | null;
  isMain: boolean;
}

export interface DataVersion {
  dataType: string;
  lastModified: number;
}

export const api = {
  salts: (email: string) => req<Salts>('POST', '/api/auth/salts', { email }),
  register: (b: { email: string; authProof: string; authSalt: string; kekSalt: string; wrappedDek: string; dekIv: string }) =>
    req<{ userId: string }>('POST', '/api/auth/register', b),
  login: (email: string, authProof: string, durationDays?: number) => req<AuthResult>('POST', '/api/auth/login', { email, authProof, durationDays }),
  session: () => req<AuthResult>('GET', '/api/auth/session'),
  logout: () => req<{ ok: boolean }>('POST', '/api/auth/logout'),
  listSessions: () => req<DeviceSession[]>('GET', '/api/sessions'),
  revokeSession: (id: string) => req<{ ok: boolean }>('POST', `/api/sessions/${id}/revoke`),
  revokeOtherSessions: () => req<{ ok: boolean; revoked: number }>('POST', '/api/sessions/revoke-others'),
  setSessionDuration: (days: number) => req<{ ok: boolean; days: number }>('PATCH', '/api/auth/session-duration', { days }),
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
  getVersions: () => req<DataVersion[]>('GET', '/api/data/versions'),
  putData: (type: string, encryptedBlob: string, iv: string, baseVersion?: number) =>
    req<{ ok: boolean; lastModified: number }>('PUT', `/api/data/${type}`, { encryptedBlob, iv, baseVersion }),
  deleteData: (type: string) => req<{ ok: boolean }>('DELETE', `/api/data/${type}`),

  saveSimulation: (name: string, encryptedBlob: string, iv: string, parentId?: string | null, isMain?: boolean, workspaceId?: string) =>
    req<{ id: string; createdAt: number }>('POST', '/api/simulations', { name, encryptedBlob, iv, parentId, isMain, workspaceId }),
  listSimulations: (workspaceId?: string) =>
    req<SimulationMeta[]>('GET', `/api/simulations${workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : ''}`),
  getSimulation: (id: string) =>
    req<StoredBlob & SimulationMeta>('GET', `/api/simulations/${id}`),
  updateSimulation: (id: string, patch: { name?: string; encryptedBlob?: string; iv?: string }) =>
    req<{ ok: boolean; updatedAt: number }>('PUT', `/api/simulations/${id}`, patch),
  deleteSimulation: (id: string) => req<{ ok: boolean }>('DELETE', `/api/simulations/${id}`),
  promoteSimulation: (id: string) => req<{ ok: boolean }>('POST', `/api/simulations/${id}/promote`),
};
