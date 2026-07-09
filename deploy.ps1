# Deploy di k-prevention su Google Cloud Run (Windows PowerShell).
# Prerequisiti: gcloud autenticato (gcloud auth login) e progetto con fatturazione attiva.
# NON serve `gcloud auth application-default login`: il seed avviene DENTRO Cloud Run
# all'avvio (SEED_ON_START), con le credenziali del service account.
#
# Uso:
#   .\deploy.ps1 -Project "il-tuo-progetto" [-Region europe-west1] [-FrancescoPassword "..."]

param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Region = "europe-west1",
  [string]$Service = "k-prevention",
  [string]$FrancescoPassword = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==> Progetto: $Project | Regione: $Region | Servizio: $Service"
gcloud config set project $Project | Out-Null

Write-Host "==> Abilito le API necessarie..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com | Out-Null

Write-Host "==> Verifico il database Firestore (default)..."
$dbOk = $true
try { gcloud firestore databases describe --database="(default)" *> $null } catch { $dbOk = $false }
if (-not $dbOk) { Write-Host "   creo il database Firestore in eur3..."; gcloud firestore databases create --location=eur3 | Out-Null }

# Segreto di produzione (32 byte, base64url: nessun +,/,= per non confondere il parser di --set-env-vars)
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Password di Francesco: fissa (riproducibile). Generata se non fornita.
if ($FrancescoPassword -eq "") {
  $FrancescoPassword = node --input-type=module -e "import('./server/lib/seedFrancesco.js').then(m=>process.stdout.write(m.generatePassword()))"
}
Write-Host "==> Segreto e password generati."

Write-Host "==> Deploy (build da sorgente via Cloud Build) + seed automatico all'avvio..."
$envVars = "STORE_BACKEND=firestore,SERVER_SECRET=$secret,SEED_ON_START=1,FRANCESCO_PASSWORD=$FrancescoPassword"
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars $envVars

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"

Write-Host ""
Write-Host "===================================================="
Write-Host " k-prevention e' online: $url"
Write-Host ""
Write-Host " Utente predefinito (creato all'avvio del servizio):"
Write-Host "   Email:    francesco.pernice@k-prevention.app"
Write-Host "   Password: $FrancescoPassword"
Write-Host "===================================================="
Write-Host ""
Write-Host "NB: SERVER_SECRET e FRANCESCO_PASSWORD sono nelle variabili d'ambiente del servizio."
Write-Host "    Per produzione seria spostali in Secret Manager (--set-secrets)."

# Salva le credenziali in locale (gitignored).
@"
=== k-prevention · credenziali utente predefinito (produzione) ===
URL:      $url
Email:    francesco.pernice@k-prevention.app
Password: $FrancescoPassword
"@ | Out-File -FilePath "FRANCESCO_CREDENTIALS.txt" -Encoding utf8
