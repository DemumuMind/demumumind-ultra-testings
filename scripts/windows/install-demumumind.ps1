param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [string]$OpenAIApiKey = "",
  [string]$NvidiaApiKey = ""
)

$ErrorActionPreference = "Stop"

if (-not $IsWindows) {
  throw "DemumuMind Ultra Testings installer currently supports Windows only."
}

Write-Host "== DemumuMind Ultra Testings bootstrap ==" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node 22+ and re-run this script."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm was not found. Enabling Corepack..." -ForegroundColor Yellow
  corepack enable
  corepack prepare pnpm@10.29.2 --activate
}

$dataDir = Join-Path $HOME ".demumumind"
$policyDir = Join-Path $dataDir "policies"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $policyDir | Out-Null

if ($OpenAIApiKey) {
  [Environment]::SetEnvironmentVariable("OPENAI_API_KEY", $OpenAIApiKey, "User")
  Write-Host "Saved OPENAI_API_KEY for the current user." -ForegroundColor Green
}

if ($NvidiaApiKey) {
  [Environment]::SetEnvironmentVariable("NVIDIA_API_KEY", $NvidiaApiKey, "User")
  [Environment]::SetEnvironmentVariable("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1", "User")
  Write-Host "Saved NVIDIA_API_KEY and NVIDIA_BASE_URL for the current user." -ForegroundColor Green
}

Push-Location $ProjectRoot
try {
  pnpm install
  pnpm build
  pnpm --filter @shannon/server exec node dist/index.js
} finally {
  Pop-Location
}
