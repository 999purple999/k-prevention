# PROGRESS — k-prevention

Stato di avanzamento del progetto, come richiesto dai prompt delle tre fasi. Le fasi
originali erano scritte per Cloudflare (Workers + D1 + KV); su richiesta esplicita il
target di deploy è **Google Cloud Run**. Ogni principio architetturale dei prompt è stato
mantenuto — è cambiato solo il substrato di hosting.

## Adattamento di piattaforma (Cloudflare → Google Cloud Run)

| Prompt (Cloudflare) | Qui (Google Cloud Run) | Perché è equivalente |
|---|---|---|
| Worker + Static Assets | Un unico servizio Node/Express che serve la SPA (`/dist`) e le API `/api/*` | Un solo container, un solo deploy — stessa filosofia "un solo artefatto" |
| D1 (SQLite) | `node:sqlite` in locale · **Firestore** in produzione | Astrazione `Store` con due backend intercambiabili |
| KV (SESSION_KV) | Sessione stateless via JWT in cookie httpOnly | Nessuno stato server necessario; nessun KV |
| `wrangler deploy` | `gcloud run deploy --source .` (Cloud Build) | Un comando, build + deploy insieme |
| `wrangler secret put` | `--set-env-vars` / Secret Manager | Stesso ruolo per `SERVER_SECRET` |

## FASE 1 — fondamenta, auth, crittografia ✅

- **Crittografia a due chiavi** (`src/lib/crypto.ts`, isomorfa browser/Node):
  - `deriveAuthProof` PBKDF2-SHA256 **600.000** iterazioni → 32 byte.
  - `deriveKEK` PBKDF2 600k → AES-GCM 256, **non estraibile**.
  - `generateDEK` / `wrapDEK` / `unwrapDEK` (DEK casuale avvolta dalla KEK).
  - `encryptData` / `decryptData` con **AAD = `${userId}:${dataType}`**, IV 96-bit nuovo a ogni cifratura.
- **Server** (`server/`): Express. Auth `register` / `salts` / `login` / `logout` / `password`.
  - `email_lookup = HMAC-SHA256(SERVER_SECRET, lower(email))` (deterministico → interrogabile).
  - `/salts` per email sconosciute restituisce **sali finti deterministici** della stessa forma (no user-enumeration).
  - authProof **ri-hashato con scrypt** lato server (no pass-the-hash). Verifica in tempo costante.
  - JWT solo in cookie **httpOnly; SameSite=Strict; Secure in prod**.
- **Store** (`server/store/`): interfaccia comune, backend `sqlite` (default) e `firestore`.
  - Tabelle `users` / `user_data` / `simulations` come da specifica; blob trattati come stringhe opache (nessun `JSON.parse` del contenuto).
- **Test (Vitest)** — tutti verdi:
  - `crypto.roundtrip`, `crypto.wrongKey`, `crypto.aadMismatch`, `crypto.ivUniqueness`
  - `auth.saltOracle`, **`server.blindness`** (il canarino `SEGRETO_CANARINO_42` non compare in nessuna colonna).

### Risorse / decisioni Fase 1
- Nessuna risorsa Cloudflare creata (piattaforma cambiata). Le risorse GCP sono: il servizio Cloud Run e (in prod) il database Firestore `(default)`.
- Decisione documentata: **chiave in sola memoria** (vedi README, "Compromesso sulla persistenza della chiave").

## FASE 2 — motore di simulazione Monte Carlo ✅

- `src/engine/random.ts` — mulberry32 seminato + sotto-stream per asse (focus, drop, importi, ritardi, imprevisti, occorrenze, spese).
- `src/engine/distributions.ts` — fixed, uniform, triangular, normal (Box-Muller+clamp), lognormal, beta (due gamma), poisson (Knuth), bernoulli.
- `src/engine/tax.ts` — forfettario (cassa) + ordinario (approssimazione mensile); **accrual vs cash**; `MissingTaxRate` se un'aliquota è null.
- `src/engine/simulate.ts` — funzione **pura**, ordine di applicazione di `_engineRules.1`; ledger dei crediti, drop con persistenza, imprevisti Poisson×lognormale, **antithetic variates**, convergenza (SE della mediana), tutti i `riskFlags`.
- `src/workers/simulation.worker.ts` — wrapper Web Worker, progresso ogni 50 iterazioni, **nessun `fetch`**.
- **Test (10/10 verdi)**: determinismo, sanity deterministica, ledger, focus selettivo, timing fiscale (giugno/novembre), forfettario ignora deduzioni, coda pesante, convergenza, rovina, aliquota mancante.

### Performance (Passo 7)
- **2000 iterazioni × 36 mesi ≈ 250–320 ms** (desktop, dataset reale di Francesco). Ampiamente sotto la soglia di 2 s.
- `grep Math.random src/engine src/workers` → nulla (solo commenti). `grep fetch( src/workers` → nulla.

### Parametrizzazione (note)
- Correlazione focus↔importi: implementata come **copula degradata** (shift della mediana lognormale `median·exp(ρ·σ·z_focus)`), documentata come ammessa dallo schema, per evitare l'inversione numerica della beta nel ciclo interno.
- Timing fiscale: modello "paga il maturato accumulato nei mesi di `paymentSchedule`" — separa accrual e cassa e produce i picchi di giugno/novembre; è una **semplificazione** del calendario acconti/saldo reale (fuori scope l'anno-limite e la maggiorazione 0,40%), coerente con i campi `_unverified`.

## FASE 3 — interfaccia, importazione, deploy ✅

- SPA React + Vite + TypeScript + Tailwind + React Router + Recharts.
- Pagine: `/login`, `/dashboard`, `/import`, `/settings`. Rotte protette (redirect a `/login` se la DEK non è in memoria).
- Componenti: `IncomeManager` (toggle focusSensitive + avviso), `ExpenseManager` (deducibile disabilitato in forfettario + nota), `OrganicSliders` (sparkline della distribuzione in tempo reale), `TaxSelector` (campi null con bordo di avviso), `SimulationRunner` (Web Worker, anteprima 200 iter + completa), `RiskPanel` (probabilità di rovina in cima).
- Grafici: **fan chart** (p10–p90, p25–p75, mediana), barre del cash flow (imposte evidenziate), istogramma del capitale finale (coda di rovina in rosso), waterfall del mese.
- Import: riconosce modello completo (valida `_meta.schemaVersion`, rifiuta major diverso) e spese studio (`gear_final.json`); voci `amount:null` importate **disabilitate** con badge "prezzo da verificare"; ignora `summary`; mostra `_factualConflicts`; anteprima diff prima di confermare.
- UI/UX: Tailwind, dark/light automatico, formato **it-IT** (`€ 15.000,00`), badge "Cifrato end-to-end · il server non può leggere questi dati" su ogni schermata protetta.
- Cambio password (`/settings`): riavvolge la stessa DEK con la nuova KEK — **nessun dato ri-cifrato**.

### Verifica end-to-end (a mano) ✅
- Seed di **Francesco Pernice** (`server/seed.js`): utente + 7 blob cifrati.
- `server.blindness` sul DB reale: nessuna stringa sensibile (`Commotion`, `barista`, `Neumann`, `15000`, `francesco.pernice`, importi) in chiaro.
- Flusso via HTTP: `login → unwrap DEK → decrypt di tutti i blob → barista Bar Commotion presente → simulate` → probabilità di rovina 40,5%, capitale@36 mediano ~25.900€.
- Browser: login, dashboard, RiskPanel, i 4 grafici (il **buco di aprile** è visibile nel fan chart), gli editor. Nessun errore in console.

## Dati precaricati (Francesco Pernice)
- Redditi: **Barista — Bar Commotion (aperitivi ven/sab/dom), 600–800 €/mese** (triangolare), Mix & mastering, Consulenza tech (pagatore lento), Royalties.
- Spese: base (affitto, utenze, alimentari, software) + **setup studio riconciliato da Gemini+Perplexity** (`gear_final.json`): 16 voci verificate, 4 disabilitate (Apollo/U87 come alternative, Stedman/Serum come "prezzo da verificare").
- Fiscale: forfettario con valori 2025 come ultimo dato noto (banner "da confermare").

## Review adversariale + hardening

Passata una review multi-agente (5 dimensioni: motore, crypto/sicurezza, stato React,
server/store, build/deploy) con verifica adversariale di ogni finding. Bug reali corretti
e verificati:

- **Deploy (critico):** il seed locale usava un `SERVER_SECRET` diverso da quello di Cloud
  Run → login di produzione rotto; e richiedeva ADC non documentate. Risolto: il seed
  avviene DENTRO Cloud Run all'avvio (`SEED_ON_START`), stesso processo/segreto, ADC del
  service account, idempotente. Verificato: server con DB vuoto → "seed: creato" → login+decrypt OK.
- **Motore (subdolo):** l'antithetic (1-u) su Box-Muller non negava il normale (gemelli con
  corr +0,58 → varianza AUMENTATA, convergenza falsata). Risolto con quantile inversa (Acklam):
  corr = -1 esatta, convergenza conservativa. Verificato empiricamente.
- **Server:** wrapper async su tutti gli handler (Express 4 non inoltra le promise rifiutate)
  + error middleware; rate limiter su `req.ip` (trust proxy) invece del token X-Forwarded-For
  grezzo; import dinamico del backend store (niente node:sqlite in modalità firestore).
- **Client:** `useSimulation` con un solo listener instradato per `runId` (niente memory leak
  né risultati obsoleti); flush dei salvataggi in sospeso su visibilitychange/beforeunload.
- **Runtime:** Node 24 in Dockerfile e CI; `crypto.ts` copiato nell'immagine runtime.

Findings scartati dopo verifica: enumerazione su /register (tradeoff intrinseco, già
rate-limited), JWT senza revoca server-side (accettabile per l'app), differenza tecnica
sqlite/firestore su `scanForPlaintext` (metodo solo-test).

## v2 — Copilota quotidiano

Estensione della v1 in strumento d'uso quotidiano (tutto testato/verificato):

- **Consuntivo & rolling forecast** — nuovo blob `ledger` (saldo reale + attuali per mese +
  transazioni). Il motore si ri-àncora al presente via `anchorInput` (nessuna modifica invasiva
  al motore). UI: `QuickLog`, `PlanVsActual`, pagina `Registra`. Verificato: transazione dal
  browser → letta decifrata dal CLI (round-trip E2E cross-device).
- **Scenari stile Git** — `simulations` esteso (`parent_id`, `updated_at`, `is_main`) + endpoint
  PUT/DELETE/promote. Pagina `Scenari`: salva ramo, confronta, promuovi, import/export.
  Verificato: scenari creati dal CLI compaiono nel browser.
- **PWA** — `vite-plugin-pwa` (manifest + service worker, offline), icone da `favicon.svg`,
  install prompt, layout mobile con bottom-tab. La PWA è attiva solo nella build di produzione.
- **Sync maniacale** — concorrenza ottimistica (`baseVersion` → 409 + merge a 3 vie), push SSE
  (`/api/sync/stream`, solo metadati), polling di fallback (`/api/data/versions`), coda offline.
  Verificato: modifica su un client → visibile sull'altro; merge testato (7 test in `sync.test.ts`).
- **Ponte AI** — CLI `cli/kprev.js` (login/pull/push/sims/simulate/optimize) + server MCP
  `mcp/kprev-mcp.js`. La chiave resta locale (E2E intatto). `optimize` cerca lo scenario che
  centra un obiettivo e lo spiega. Verificato da questa chat: rovina 39%→1% con la leva giusta.

Test totali: **24 verdi**. Nuove dipendenze: `vite-plugin-pwa`, `sharp` (dev, gen icone),
`@modelcontextprotocol/sdk` (dev). Nuovo tipo dato `ledger` in allowlist.

## Cosa resta (deploy)
- `git init` + repository GitHub: richiede autenticazione GitHub (token/`gh auth login`).
- Deploy su Cloud Run: richiede `gcloud auth login` + progetto GCP con billing. Comandi pronti in `README.md` e `deploy.ps1`.
