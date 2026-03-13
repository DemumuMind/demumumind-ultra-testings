param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [string]$OpenAIApiKey = "",
  [string]$NvidiaApiKey = "",
  [switch]$BuildDesktop,
  [switch]$LaunchDaemon,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param(
    [int]$Number,
    [string]$Message
  )

  Write-Host ("[{0}/7] {1}" -f $Number, $Message) -ForegroundColor Cyan
}

function Get-Decision {
  param(
    [string]$Prompt,
    [bool]$Default = $true
  )

  if ($NonInteractive) {
    return $Default
  }

  $suffix = if ($Default) { " [Y/n]" } else { " [y/N]" }
  $answer = Read-Host ($Prompt + $suffix)

  if ([string]::IsNullOrWhiteSpace($answer)) {
    return $Default
  }

  return @("y", "yes") -contains $answer.Trim().ToLowerInvariant()
}

function Invoke-ElectronPostinstall {
  param(
    [string]$WorkspaceRoot
  )

  $electronPackage = Get-ChildItem (Join-Path $WorkspaceRoot "node_modules\\.pnpm") -Directory -Filter "electron@*" |
    Sort-Object Name -Descending |
    Select-Object -First 1

  if (-not $electronPackage) {
    Write-Host "Electron package was not found after pnpm install; skipping desktop runtime bootstrap." -ForegroundColor Yellow
    return
  }

  $installScript = Join-Path $electronPackage.FullName "node_modules\\electron\\install.js"

  if (-not (Test-Path $installScript)) {
    Write-Host "Electron install.js was not found; skipping desktop runtime bootstrap." -ForegroundColor Yellow
    return
  }

  Write-Host "Bootstrapping Electron runtime assets..." -ForegroundColor Cyan
  node $installScript
}

function Show-DoctorSummary {
  param(
    [string]$WorkspaceRoot,
    [bool]$DesktopRequested,
    [bool]$DaemonRequested
  )

  $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue
  $nodeVersion = node --version
  $powerShellVersion = $PSVersionTable.PSVersion.ToString()
  $openAIStatus = if ($OpenAIApiKey -or $env:OPENAI_API_KEY) { "configured" } else { "missing" }
  $nvidiaStatus = if ($NvidiaApiKey -or $env:NVIDIA_API_KEY) { "configured" } else { "missing" }

  Write-Host ""
  Write-Host "Doctor summary" -ForegroundColor Green
  Write-Host ("- Windows platform: ready")
  Write-Host ("- PowerShell: {0}" -f $powerShellVersion)
  Write-Host ("- Node.js: {0}" -f $nodeVersion)
  Write-Host ("- pnpm: {0}" -f $(if ($pnpmCommand) { $pnpmCommand.Source } else { "missing" }))
  Write-Host ("- OPENAI_API_KEY: {0}" -f $openAIStatus)
  Write-Host ("- NVIDIA_API_KEY: {0}" -f $nvidiaStatus)
  Write-Host ("- Desktop packaging requested: {0}" -f $(if ($DesktopRequested) { "yes" } else { "no" }))
  Write-Host ("- Launch daemon requested: {0}" -f $(if ($DaemonRequested) { "yes" } else { "no" }))
  Write-Host ("- Workspace: {0}" -f $WorkspaceRoot)
}

function Start-DemumuMindDaemon {
  param(
    [string]$WorkspaceRoot
  )

  $pnpmCommand = Get-Command pnpm -ErrorAction Stop
  $process = Start-Process -FilePath $pnpmCommand.Source `
    -ArgumentList @("--filter", "@shannon/server", "exec", "node", "dist/index.js") `
    -WorkingDirectory $WorkspaceRoot `
    -PassThru

  Write-Host ("Started demumumindd in the background (PID {0})." -f $process.Id) -ForegroundColor Green
}

if (-not $IsWindows) {
  throw "DemumuMind Ultra Testings installer currently supports Windows only."
}

$desktopRequested = if ($PSBoundParameters.ContainsKey("BuildDesktop")) {
  [bool]$BuildDesktop
} else {
  Get-Decision -Prompt "Build a portable desktop shell after bootstrap?" -Default $false
}

$daemonRequested = if ($PSBoundParameters.ContainsKey("LaunchDaemon")) {
  [bool]$LaunchDaemon
} else {
  Get-Decision -Prompt "Launch the local daemon after bootstrap?" -Default $false
}

Write-Host "== DemumuMind Ultra Testings bootstrap ==" -ForegroundColor Cyan
Write-Host ("Project root: {0}" -f $ProjectRoot)

Write-Step -Number 1 -Message "Checking Windows prerequisites"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is required. Install Node 22+ and re-run this script."
}

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm was not found. Enabling Corepack..." -ForegroundColor Yellow
  corepack enable
  corepack prepare pnpm@10.29.2 --activate
}

Write-Step -Number 2 -Message "Preparing local DemumuMind directories"
$dataDir = Join-Path $HOME ".demumumind"
$policyDir = Join-Path $dataDir "policies"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $policyDir | Out-Null

Write-Step -Number 3 -Message "Saving provider configuration"
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
  Write-Step -Number 4 -Message "Installing workspace dependencies"
  pnpm install

  Write-Step -Number 5 -Message "Bootstrapping Electron runtime assets"
  Invoke-ElectronPostinstall -WorkspaceRoot $ProjectRoot

  Write-Step -Number 6 -Message "Building the workspace"
  pnpm build

  if ($desktopRequested) {
    Write-Step -Number 7 -Message "Packaging the portable desktop shell"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "scripts\\windows\\package-desktop.ps1") -ProjectRoot $ProjectRoot -PortableOnly -SkipInstall -NonInteractive
  } else {
    Write-Step -Number 7 -Message "Skipping desktop packaging at operator request"
  }

  if ($daemonRequested) {
    Start-DemumuMindDaemon -WorkspaceRoot $ProjectRoot
  }
} finally {
  Pop-Location
}

Show-DoctorSummary -WorkspaceRoot $ProjectRoot -DesktopRequested $desktopRequested -DaemonRequested $daemonRequested
Write-Host ""
Write-Host "Bootstrap complete" -ForegroundColor Green
Write-Host "- Run `pnpm exec demumumind /doctor` to verify the local CLI."
Write-Host "- Run `pnpm dev:web` for the localhost control plane."
Write-Host "- Run `pnpm dev:desktop` for the Electron shell."
Write-Host "- Guided installer is optional; the canonical repo flow is clone -> corepack enable -> pnpm install -> pnpm build -> pnpm exec demumumind /doctor."
