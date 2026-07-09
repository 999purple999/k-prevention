/** Tipi di dato consentiti per i blob cifrati. Il server valida `:type` contro questa
 *  allowlist ma NON ne interpreta mai il contenuto. */
export const DATA_TYPES = [
  'incomeStreams',
  'expenses',
  'organicParameters',
  'taxModel',
  'simulationConfig',
  'monteCarlo',
  'profile',
];

export const isValidDataType = (t) => DATA_TYPES.includes(t);
