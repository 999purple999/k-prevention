# Deploy di k-prevention su Google Cloud Run (Windows PowerShell).
# Prerequisiti: gcloud autenticato (gcloud auth login) e progetto impostato.
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

Write-Host "==> Abilito le API necessarie…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com firestore.googleapis.com | Out-Null

Write-Host "==> Verifico il database Firestore (default)…"
try { gcloud firestore databases describe --database="(default)" *> $null }
catch { Write-Host "   creo il database Firestore in eur3…"; gcloud firestore databases create --location=eur3 | Out-Null }

# Segreto di produzione (32 byte base64)
$secret = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
Write-Host "==> SERVER_SECRET generato."

Write-Host "==> Deploy (build da sorgente via Cloud Build)…"
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --set-env-vars "STORE_BACKEND=firestore,SERVER_SECRET=$secret"

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host "==> Online: $url"

Write-Host "==> Seed dell'utente Francesco Pernice su Firestore…"
$env:STORE_BACKEND = "firestore"
$env:GOOGLE_CLOUD_PROJECT = $Project
if ($FrancescoPassword -ne "") { $env:FRANCESCO_PASSWORD = $FrancescoPassword }
node server/seed.js

Write-Host ""
Write-Host "===================================================="
Write-Host " k-prevention è online: $url"
Write-Host " Le credenziali di Francesco sono qui sopra e in FRANCESCO_CREDENTIALS.txt"
Write-Host "===================================================="
