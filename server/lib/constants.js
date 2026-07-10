/** Tipi di dato consentiti per i blob cifrati. Il server valida `:type` contro questa
 *  allowlist ma NON ne interpreta mai il contenuto.
 *
 *  Multi-workspace: oltre ai tipi base (workspace "Personale" = default), sono validi i
 *  tipi namespaced `w_<id>_<tipoBase>` (workspace aggiuntivi, es. "Azienda"), più il blob
 *  indice `workspaces`. */
export const BASE_DATA_TYPES = [
  'incomeStreams',
  'expenses',
  'organicParameters',
  'taxModel',
  'simulationConfig',
  'monteCarlo',
  'profile',
  'ledger', // consuntivo: saldo reale + attuali per mese (rolling forecast)
];

export const DATA_TYPES = [...BASE_DATA_TYPES, 'workspaces'];

const NS_RE = new RegExp(`^w_[a-z0-9]{1,16}_(${BASE_DATA_TYPES.join('|')})$`);

export const isValidDataType = (t) => typeof t === 'string' && (DATA_TYPES.includes(t) || NS_RE.test(t));
