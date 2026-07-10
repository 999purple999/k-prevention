<div align="center">

<img src="public/favicon.svg" width="76" alt="k-prevention" />

# k-prevention

### Il copilota di liquidità per liberi professionisti — simulatore Monte Carlo<br/>cifrato end-to-end, d'uso quotidiano, con ponte AI. Su Google Cloud Run.

[![CI](https://github.com/999purple999/k-prevention/actions/workflows/ci.yml/badge.svg)](https://github.com/999purple999/k-prevention/actions/workflows/ci.yml)
[![Deploy demo to GitHub Pages](https://github.com/999purple999/k-prevention/actions/workflows/pages.yml/badge.svg)](https://github.com/999purple999/k-prevention/actions/workflows/pages.yml)
[![Demo dal vivo](https://img.shields.io/badge/%F0%9F%9A%80%20demo-dal%20vivo-22cee9)](https://999purple999.github.io/k-prevention/)
![License](https://img.shields.io/badge/license-MIT-blue)

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-FF6384?logo=chartdotjs&logoColor=white)
![Node](https://img.shields.io/badge/Node_%E2%89%A5_22-339933?logo=nodedotjs&logoColor=white)
![Google Cloud Run](https://img.shields.io/badge/Cloud_Run-4285F4?logo=googlecloud&logoColor=white)

**[▶ Prova la demo dal vivo](https://999purple999.github.io/k-prevention/)** &nbsp;·&nbsp; funziona anche da telefono, nessun account necessario.

</div>

---

> Una proiezione finanziaria non è una linea: è un **fascio di traiettorie**. k-prevention simula migliaia di
> futuri della tua liquidità — con ritardi di pagamento, mesi di scarso focus, imprevisti a coda pesante e le
> scadenze fiscali italiane nei mesi giusti — e risponde all'unica domanda che conta: **qual è la probabilità di
> restare a secco?**

Il server è un **passacarte cieco**: vede solo blob cifrati. Ogni calcolo avviene nel tuo browser, dopo aver
decifrato i dati con una chiave derivata dalla tua password.

---

## 📱 Demo dal vivo e uso da telefono

Ci sono **due modi** di provare k-prevention, entrambi accessibili da qualsiasi dispositivo (desktop, tablet, telefono):

| | Demo statica (GitHub Pages) | App completa (Google Cloud Run) |
|---|---|---|
| **URL** | `https://999purple999.github.io/k-prevention/` | `https://k-prevention-…run.app` (dopo il deploy) |
| **Login** | nessuno — entri subito con i dati d'esempio | account reale (email + password) |
| **Backend** | nessuno: tutto nel browser | server Node su Cloud Run |
| **Cifratura** | non necessaria (dati d'esempio) | end-to-end (il server è cieco) |
| **Persistenza** | `localStorage` del browser | Firestore |
| **A cosa serve** | mostrare l'app in 2 secondi, anche dal telefono | uso reale con i tuoi dati privati |

La demo è **responsive** e pensata anche per lo schermo del telefono. La build statica è prodotta da
`npm run build:demo` e pubblicata automaticamente su GitHub Pages dal workflow `.github/workflows/pages.yml`.

## Indice
- [Demo dal vivo e uso da telefono](#-demo-dal-vivo-e-uso-da-telefono)
- [Funzionalità](#funzionalità)
- [Copilota quotidiano (v2)](#copilota-quotidiano-v2)
- [Ponte AI: CLI + MCP](#ponte-ai-cli--server-mcp)
- [Architettura](#architettura)
- [Avvio rapido (locale)](#avvio-rapido-locale)
- [Variabili d'ambiente e secret](#variabili-dambiente-e-secret)
- [Utente predefinito (Francesco Pernice)](#utente-predefinito-francesco-pernice)
- [Test](#test)
- [Deploy su Google Cloud Run](#deploy-su-google-cloud-run)
- [Compromesso sulla persistenza della chiave](#compromesso-sulla-persistenza-della-chiave)
- [Cosa il server può e non può vedere](#cosa-il-server-può-e-non-può-vedere)
- [Limiti del modello](#limiti-del-modello)

---

## Funzionalità

- **Motore Monte Carlo seminato e riproducibile** — stesso seed → output byte-identico. Nessun `Math.random()`.
  Ogni grandezza incerta è una distribuzione (fixed, uniforme, triangolare, normale, lognormale, beta, Poisson,
  Bernoulli); una proiezione è una banda di percentili, non una linea.
- **Realismo organico** — focus mensile (beta), cali di produttività con **persistenza** (i mesi brutti si
  aggregano nel trimestre disastroso), imprevisti come somma composta di Poisson×lognormale (coda pesante),
  ledger dei crediti con ritardi di incasso, correlazione focus↔importi.
- **Fisco italiano fatto bene** — regime forfettario (di cassa) e ordinario; separazione **accrual vs cassa**:
  le imposte maturano ogni mese ma escono dal conto solo a giugno e novembre. In forfettario le spese **non**
  sono deducibili e l'app te lo dice invece di lasciartelo credere.
- **La probabilità di rovina in cima**, non sepolta sotto i grafici. Più: autonomia (runway) ai percentili,
  crediti oltre l'orizzonte, avvisi di rischio spiegati.
- **Grafici che non mentono** — fan chart (p10–p90 / p25–p75 / mediana), barre del cash flow con i picchi
  fiscali evidenziati, istogramma del capitale finale con la coda di rovina in rosso, waterfall del mese.
- **Cifratura end-to-end** — PBKDF2 600k, AES-GCM 256, schema a due chiavi (KEK/DEK), AAD legato a utente+tipo.
- **Import JSON** con anteprima diff: modello completo o lista spese studio; le voci senza prezzo verificato
  entrano disabilitate con badge "prezzo da verificare".
- **Reattività** — anteprima a 200 iterazioni mentre modifichi, simulazione completa on-demand, tutto in un
  Web Worker (la UI non si blocca).
- **Multi-dispositivo** — SPA responsive, tema chiaro/scuro automatico, numeri in formato **it-IT**.

## Copilota quotidiano (v2)

k-prevention non è solo un simulatore: è lo strumento che porti in tasca ogni giorno.

- **Consuntivo & rolling forecast** — registri il **saldo reale** e, mese per mese, cosa hai
  speso/incassato davvero (es. *"utenze 50€ invece di 300 perché ha pagato mamma"*). La
  proiezione si **ri-àncora al presente**: da oggi in avanti simula il futuro partendo dal tuo
  saldo effettivo. La vista **Piano vs Reale** ti dice se sei in linea.
- **Scenari stile Git** — salva lo stato come **ramo**, confronta due scenari fianco a fianco
  (rovina, capitale, autonomia), **promuovi** il migliore a principale, importa/esporta tutto.
- **App installabile (PWA)** — apri il sito sul telefono e **«Aggiungi a Home»**: funziona a
  schermo intero e **offline** (le modifiche partono alla riconnessione). UI mobile con
  bottom-tab (Rischio · Registra · Scenari · Modifica), semplice ma completa.
- **Sincronizzazione maniacale** — cifrata end-to-end, in tempo reale tra i tuoi dispositivi
  (SSE + polling di fallback), con concorrenza ottimistica e **merge a 3 vie** dei conflitti,
  e coda offline. Modifichi sul portatile → il telefono si aggiorna in un secondo.
- **Ponte AI (CLI + MCP)** — un LLM (io compreso) può collegarsi **con la tua chiave, in
  locale**, leggere i dati **decifrati** e costruire/ottimizzare scenari, spiegandoli. L'E2E
  resta intatto: la chiave non lascia il dispositivo. Vedi [Ponte AI](#ponte-ai-cli--mcp).

## Ponte AI: CLI `kprev` + server MCP

Il server è cieco, quindi un'AI accede ai dati **decifrati** solo tramite un ponte locale che
tiene la chiave sul tuo dispositivo. È l'approccio più sicuro (niente chiaro nel cloud).

```bash
# imposta l'endpoint e le credenziali (o verranno chieste)
export KPREV_BASE="https://k-prevention-….run.app"   # o http://localhost:8080
export KPREV_EMAIL="francesco.pernice@k-prevention.app"
export KPREV_PASSWORD="…"

node cli/kprev.js login                       # autentica; sessione in ~/.kprev/
node cli/kprev.js pull                         # TUTTI i dati decifrati (JSON)
node cli/kprev.js pull expenses                # solo un tipo
node cli/kprev.js simulate                     # esegue la simulazione → sintesi
node cli/kprev.js optimize --goal "ruin<0.1"   # cerca lo scenario che centra l'obiettivo…
node cli/kprev.js optimize --goal "capital@36>25000" --save   # …e salva il migliore
node cli/kprev.js sims list|create <nome>|promote <id>|export --all
```

`optimize` prova diverse **leve** (taglia spese discrezionali, rinvia lo studio, più turni da
barista, solo lo studio essenziale…), classifica gli scenari per l'obiettivo e **spiega** perché
il migliore funziona (es. *"studio essenziale + niente spese superflue → rovina dal 39% all'1%"*).

**MCP (Claude Desktop o altri client)** — esponi gli stessi strumenti a un LLM. In
`claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "kprev": {
      "command": "node",
      "args": ["/PERCORSO/ASSOLUTO/mcp/kprev-mcp.js"],
      "env": { "KPREV_BASE": "https://…run.app", "KPREV_EMAIL": "…", "KPREV_PASSWORD": "…" }
    }
  }
}
```
Strumenti: `kprev_pull`, `kprev_simulate`, `kprev_optimize`, `kprev_list_scenarios`,
`kprev_get_scenario`, `kprev_create_scenario`, `kprev_promote_scenario`.

## Architettura

Un solo servizio Node/Express servito da Cloud Run: la SPA React (build in `/dist`) e le API `/api/*` insieme.

```
Browser (React SPA)                         Cloud Run (Express)              Persistenza
─────────────────────                       ───────────────────              ───────────
password ──PBKDF2─┬─► authProof ───────────► ri-hash scrypt ──────────────►  users
                  └─► KEK (solo in RAM)                                       (Firestore / SQLite)
DEK (casuale) ──wrap con KEK──► wrappedDek ─► salvato così com'è
dati ──AES-GCM(DEK, aad)──► blob cifrato ───► passacarte (nessun JSON.parse) ► user_data
simulate() ◄── Web Worker ◄── decifra nel main thread
```

- **Frontend**: React 18, Vite, TypeScript, Tailwind, React Router, Recharts.
- **Motore**: `src/engine/*` (puro, testato), `src/workers/simulation.worker.ts`.
- **Backend**: `server/*` (Express, `jose` per i JWT, scrypt per il ri-hash).
- **Store**: `server/store/` — `node:sqlite` (locale, zero dipendenze native) o **Firestore** (produzione).

## Avvio rapido (locale)

Prerequisiti: **Node.js ≥ 22** (usa il modulo integrato `node:sqlite`).

```bash
# 1. dipendenze
npm install

# 2. configurazione: crea .env
cp .env.example .env
#    genera un SERVER_SECRET e incollalo in .env:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. crea l'utente predefinito Francesco Pernice (stampa la password)
npm run seed

# 4a. sviluppo (Vite :5173 + API Express :8080)
npm run dev
#     apri http://localhost:5173

# 4b. oppure: build + produzione (un solo server su :8080)
npm run build
npm start
#     apri http://localhost:8080
```

## Variabili d'ambiente e secret

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `SERVER_SECRET` | **sì** | 32 byte base64. Firma i JWT, deriva `email_lookup` e i sali finti. In produzione l'app **rifiuta** di partire con il valore di default. |
| `STORE_BACKEND` | no | `sqlite` (default) o `firestore`. |
| `SQLITE_PATH` | no | Percorso del file DB (solo backend sqlite). Default `./data/k-prevention.db`. |
| `GOOGLE_CLOUD_PROJECT` | solo Firestore | Su Cloud Run è iniettata automaticamente. |
| `FIRESTORE_DATABASE_ID` | no | Default `(default)`. |
| `PORT` | no | Cloud Run la inietta (default 8080). |
| `FRANCESCO_PASSWORD` | no | Se impostata, il seed usa questa password fissa (deploy riproducibile) invece di generarne una. |

## Utente predefinito (Francesco Pernice)

`npm run seed` crea l'utente **Francesco Pernice** (`francesco.pernice@k-prevention.app`) con tutti i dati già
caricati e cifrati: le fonti di reddito (incluso il part-time da **barista al Bar Commotion**, turni venerdì /
sabato / domenica in orario aperitivi, 600–800 €/mese), il **setup studio** riconciliato dalle ricerche
Gemini + Perplexity (`data/gear_final.json`), e il modello fiscale forfettario.

Il seed **stampa la password** (e la salva in `FRANCESCO_CREDENTIALS.txt`, git-ignored). La password non è
recuperabile: i dati sono cifrati con una chiave che ne deriva. Per un deploy con password nota e riproducibile:

```bash
FRANCESCO_PASSWORD="la-tua-password" npm run seed
```

## Test

```bash
npm test        # 24 test: crittografia, blindness del server, motore, merge di sync, rolling forecast
npm run typecheck
```

I test coprono, tra gli altri: roundtrip di cifratura, fallimento con chiave/AAD sbagliati, unicità degli IV,
il **canarino della blindness** (una stringa segreta salvata non compare in nessuna colonna del DB), determinismo
del motore, timing fiscale (cassa a giugno/novembre), il fatto che il forfettario ignora le deduzioni, la coda
pesante degli imprevisti, la convergenza e l'errore esplicito su un'aliquota mancante.

## Deploy su Google Cloud Run

Un solo comando fa build + deploy (Cloud Build; **non serve Docker in locale**). Firestore come persistenza.
L'utente Francesco viene creato **automaticamente all'avvio del servizio** (`SEED_ON_START=1`), nello stesso
processo del server: stesso `SERVER_SECRET` (nessun mismatch) e credenziali del service account (**non serve
`gcloud auth application-default login`**). Il seed è idempotente: non sovrascrive un utente già presente.

**Modo semplice — lo script:**
```powershell
gcloud auth login
.\deploy.ps1 -Project "il-tuo-progetto"        # -FrancescoPassword "..." opzionale (altrimenti generata)
```
Lo script abilita le API, crea Firestore se manca, genera `SERVER_SECRET` + la password, fa il deploy e stampa
URL e credenziali (salvate anche in `FRANCESCO_CREDENTIALS.txt`).

**Modo manuale:**
```bash
gcloud auth login
gcloud config set project IL_TUO_PROGETTO
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com
gcloud firestore databases create --location=eur3          # se non esiste già

SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
gcloud run deploy k-prevention \
  --source . --region europe-west1 --allow-unauthenticated \
  --set-env-vars "STORE_BACKEND=firestore,SERVER_SECRET=$SECRET,SEED_ON_START=1,FRANCESCO_PASSWORD=scegli-una-password"
```

Cloud Run restituisce l'URL `https://k-prevention-...-ew.a.run.app`. Il `Dockerfile` multi-stage (Node 24)
consente anche `gcloud run deploy --image` o qualsiasi altro runtime a container.

> Nota di sicurezza: passare `SERVER_SECRET` via `--set-env-vars` è comodo per una demo. In produzione seria usa
> **Secret Manager**: `--set-secrets SERVER_SECRET=kprev-secret:latest`.

## Compromesso sulla persistenza della chiave

La chiave che decifra i tuoi dati (la **DEK**) vive **solo nella memoria del browser**. Conseguenze:

- **Scelta adottata (solo-in-memoria).** Al refresh della pagina la chiave si perde e devi reinserire la
  password. È la scelta **più sicura**: chi riesce a iniettare JavaScript nella pagina non trova nessuna chiave
  persistente da riutilizzare dopo un reload.
- **Alternativa non adottata (IndexedDB come `CryptoKey` non estraibile).** La chiave sopravvivrebbe al reload —
  più comoda — ma chi inietta JS nella pagina, pur non potendo **leggerla**, potrebbe **usarla** finché la sessione
  è aperta. Non c'è una scelta giusta in assoluto: c'è una scelta da fare consapevolmente. Qui si è privilegiata
  la sicurezza sulla comodità.

## Cosa il server può e non può vedere

**Vede (in chiaro):**
- `email_lookup` = `HMAC-SHA256(SERVER_SECRET, lower(email))` — deterministico e non invertibile senza il segreto,
  ma consente di collegare due accessi alla stessa email.
- I **nomi delle simulazioni** salvate (non cifrati: servono per la lista — l'app lo segnala).
- I **timestamp** (creazione, ultima modifica) e la **dimensione** dei blob cifrati.
- Il **tipo** di ciascun blob (`incomeStreams`, `expenses`, …): è un enum fisso, non un dato personale.

**Non vede (mai):**
- La password (non lascia mai il browser).
- Importi, categorie, parametri, aliquote: tutto dentro blob AES-GCM che il server non può decifrare.

**Canale laterale onesto:** la **dimensione di un blob** è osservabile. Un utente con 40 spese ha un blob
`expenses` più grande di uno con 3. Non rivela i contenuti, ma è un'informazione: va detto.

## Limiti del modello

- **Le aliquote fiscali vanno verificate con un commercialista.** I valori precaricati per Francesco sono gli
  ultimi noti (2025) e l'app li marca esplicitamente come "da confermare" per il 2026. Un modello con aliquote
  allucinate è peggio di nessun modello: ha l'aria di sapere.
- **Il timing fiscale è semplificato.** L'app separa correttamente maturazione e cassa e colloca le uscite a
  giugno/novembre, ma non modella l'anno-limite degli acconti, la maggiorazione dello 0,40%, le proroghe o le
  rateizzazioni. Sul calendario esatto, verifica.
- **La simulazione è uno strumento di esplorazione, non una previsione.** `probabilityOfRuin` dipende
  **interamente** dalla parametrizzazione delle distribuzioni — che sei tu a scegliere. Cambia una mediana o una
  sigma e il numero cambia. Usalo per capire la *forma* del rischio e la sensibilità alle tue ipotesi, non come
  un oracolo.
- **Compatibilità del secondo lavoro.** Il part-time da barista è modellato come reddito netto fuori
  dall'imponibile forfettario; la compatibilità di un secondo lavoro con il regime e il corretto inquadramento
  vanno verificati con un commercialista.

---

Costruito seguendo le tre fasi del progetto (fondamenta+crypto, motore, UI+deploy). Vedi `PROGRESS.md` per il
dettaglio delle decisioni e degli adattamenti da Cloudflare a Google Cloud Run.
