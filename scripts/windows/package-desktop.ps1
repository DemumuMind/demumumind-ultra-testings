param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [switch]$PortableOnly,
  [switch]$SkipInstall,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param(
    [int]$Number,
    [string]$Message
  )

  Write-Host ("[{0}/5] {1}" -f $Number, $Message) -ForegroundColor Cyan
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
    throw "Electron package was not found after pnpm install."
  }

  $installScript = Join-Path $electronPackage.FullName "node_modules\\electron\\install.js"

  if (-not (Test-Path $installScript)) {
    throw "Electron install.js was not found."
  }

  Write-Host "Bootstrapping Electron runtime assets..." -ForegroundColor Cyan
  node $installScript
}

if (-not $IsWindows) {
  throw "Desktop packaging is supported only on Windows."
}

$buildNsis = if ($PortableOnly) {
  $false
} elseif ($PSBoundParameters.ContainsKey("PortableOnly")) {
  $false
} else {
  Get-Decision -Prompt "Build the NSIS installer in addition to the portable executable?" -Default $true
}

Push-Location $ProjectRoot
try {
  if (-not $SkipInstall) {
    Write-Step -Number 1 -Message "Installing workspace dependencies"
    pnpm install
  } else {
    Write-Step -Number 1 -Message "Skipping dependency install"
  }

  Write-Step -Number 2 -Message "Bootstrapping Electron runtime assets"
  Invoke-ElectronPostinstall -WorkspaceRoot $ProjectRoot

  Write-Step -Number 3 -Message "Building web, server, and desktop packages"
  pnpm --filter @shannon/web build
  pnpm --filter @shannon/server build
  pnpm --filter @shannon/desktop build

  Write-Step -Number 4 -Message "Running electron-builder"
  if ($buildNsis) {
    pnpm --filter @shannon/desktop exec electron-builder --win portable nsis
  } else {
    pnpm --filter @shannon/desktop exec electron-builder --win portable
  }

  Write-Step -Number 5 -Message "Packaging summary"
  Write-Host ("- Output directory: {0}" -f (Join-Path $ProjectRoot "apps\\desktop\\release"))
  Write-Host ("- Portable build: yes")
  Write-Host ("- NSIS build: {0}" -f $(if ($buildNsis) { "yes" } else { "no" }))
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Packaging complete" -ForegroundColor Green
Write-Host "- Portable artifact: apps\\desktop\\release"
Write-Host "- Re-run with -PortableOnly to skip the NSIS installer."
