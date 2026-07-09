# k-prevention

**Simulatore Monte Carlo del flusso di cassa per liberi professionisti italiani — cifrato end-to-end, deploy su Google Cloud Run.**

Una proiezione finanziaria non è una linea: è un fascio di traiettorie. k-prevention simula migliaia di
futuri della tua liquidità — con ritardi di pagamento, mesi di scarso focus, imprevisti a coda pesante e le
scadenze fiscali italiane nei mesi giusti — e risponde all'unica domanda che conta: **qual è la probabilità di
restare a secco?**

Il server è un **passacarte cieco**: vede solo blob cifrati. Ogni calcolo avviene nel tuo browser, dopo aver
decifrato i dati con una chiave derivata dalla tua password.

---

## Indice
- [Funzionalità](#funzionalità)
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
npm test        # 17 test: crittografia, blindness del server, e i 10 test del motore
npm run typecheck
```

I test coprono, tra gli altri: roundtrip di cifratura, fallimento con chiave/AAD sbagliati, unicità degli IV,
il **canarino della blindness** (una stringa segreta salvata non compare in nessuna colonna del DB), determinismo
del motore, timing fiscale (cassa a giugno/novembre), il fatto che il forfettario ignora le deduzioni, la coda
pesante degli imprevisti, la convergenza e l'errore esplicito su un'aliquota mancante.

## Deploy su Google Cloud Run

Un solo comando fa build + deploy (Cloud Build; **non serve Docker in locale**). Firestore come persistenza.

```bash
# 0. prerequisiti una tantum
gcloud auth login
gcloud config set project IL_TUO_PROGETTO
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com
gcloud firestore databases create --location=eur3         # se non esiste già

# 1. segreto di produzione (genera 32 byte)
SERVER_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

# 2. deploy (build da sorgente, un solo servizio)
gcloud run deploy k-prevention \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "STORE_BACKEND=firestore,SERVER_SECRET=$SERVER_SECRET"

# 3. crea l'utente Francesco nel Firestore di produzione
STORE_BACKEND=firestore GOOGLE_CLOUD_PROJECT=IL_TUO_PROGETTO FRANCESCO_PASSWORD="..." npm run seed
```

Cloud Run restituisce l'URL `https://k-prevention-...-ew.a.run.app`. È presente `deploy.ps1` (Windows) che
automatizza i passi 1–2. In alternativa il `Dockerfile` multi-stage consente `gcloud run deploy --image` o
qualsiasi altro runtime a container.

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
