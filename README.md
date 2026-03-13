# DemumuMind Ultra Testings

Windows-first all-in-one AppSec platform for white-box testing of web applications and APIs.

`DemumuMind Ultra Testings` combines a slash-driven CLI, a local daemon, a desktop shell, and a web control plane into one workflow for project bootstrap, scan orchestration, evidence collection, and correlated security reporting.

## Самый простой путь

```powershell
git clone https://github.com/DemumuMind/demumumind-ultra-testings.git
cd demumumind-ultra-testings
corepack enable
pnpm install
pnpm build
pnpm exec demumumind /doctor
```

## Why

- Windows-first runtime without mandatory Docker or WSL
- One product instead of separate Lite/Pro editions
- White-box coverage for Web, REST, and GraphQL projects
- Safe-by-default validation with explicit policy gates for stronger checks
- Local-first control plane for projects, runners, providers, policies, and reports

## Platform Surfaces

### CLI

Primary binary: `demumumind`

Supported interaction styles:

- From the cloned repository, run the CLI as `pnpm exec demumumind ...`
- Slash commands such as `pnpm exec demumumind /doctor`, `pnpm exec demumumind /scan start`, `pnpm exec demumumind /report open`
- Standard automation commands such as `pnpm exec demumumind doctor`, `pnpm exec demumumind project init`, `pnpm exec demumumind scan run`
- Shortcut scripts also exist at the repo root: `pnpm run doctor` and `pnpm cli -- /doctor`

### Local Daemon

Background service: `demumumindd`

- Serves the local API at `http://127.0.0.1:<port>/api`
- Stores project state, scan state, runner registry, and artifacts
- Powers the desktop shell and the browser-based control plane

### Desktop Shell

- Electron-based local shell for Windows
- Wraps the existing web control plane instead of introducing a separate UI stack
- Supports project management, scan execution, and report navigation

### Web Control Plane

- Localhost-hosted React app for operator auth, project policy, runner management, and report review
- Exposes the same control plane used by the desktop shell

## Quick Start

### Prerequisites

- Windows
- Node.js 22+
- Corepack
- Optional provider keys:
  - `OPENAI_API_KEY`
  - `NVIDIA_API_KEY`
  - `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`

### Install And Build

```powershell
git clone https://github.com/DemumuMind/demumumind-ultra-testings.git
cd demumumind-ultra-testings
corepack enable
pnpm install
pnpm build
```

If `pnpm` is missing, run `corepack enable` first instead of installing a separate global package manager manually.

### Run Doctor

```powershell
pnpm exec demumumind /doctor
```

### First Real Run

```powershell
pnpm exec demumumind /project init --name "Demo project" --base-url http://127.0.0.1:3000 --project-root . --source-root .
pnpm exec demumumind /scan start --project-id <project-id>
```

### Local Control Plane

```powershell
pnpm dev:server
pnpm dev:web
```

### What Project Bootstrap Creates

- `demumumind.config.yaml`
- `policies/default.yaml`

### Start A Scan

```powershell
pnpm exec demumumind /scan start --project-id <project-id>
```

### Open The Report

```powershell
pnpm exec demumumind /report open --scan-run-id <scan-id>
```

## Scanning Model

Current v1 pipeline:

1. Project intake
2. Environment doctor
3. Source indexing and framework detection
4. Recon and surface mapping
5. Static reasoning
6. Dynamic hypothesis generation
7. Safe exploit validation
8. Correlated reporting

## Safe Proof And Policy Gates

The platform does not mark findings as confirmed without evidence.

- `Safe Proof` is the default validation mode
- Stronger or state-changing checks require explicit project policy
- Unsupported classes remain visible in the coverage matrix instead of being reported as passed

## Capability Areas

- Recon and code indexing
- Auth flow automation
- SAST-lite and secret discovery
- Dependency inventory
- HTTP and API testing adapters
- Static analyzer and native scanner adapters
- Safe exploit packs for auth, authorization, injection, SSRF, XSS, GraphQL, and business-logic checks

## Windows Packaging

Build the desktop package:

```powershell
pnpm package:desktop
```

Bootstrap a Windows workstation:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-demumumind.ps1
```

Use the PowerShell installer as a guided bootstrap option. The primary documented path for CLI setup remains the manual `git clone -> corepack enable -> pnpm install -> pnpm build -> pnpm exec demumumind /doctor` flow above.

## Verification

```powershell
pnpm test
pnpm typecheck
pnpm build
```

## Repository

- Issues: [GitHub Issues](https://github.com/DemumuMind/demumumind-ultra-testings/issues)
- Source: [DemumuMind/demumumind-ultra-testings](https://github.com/DemumuMind/demumumind-ultra-testings)

## Status

This repository currently contains the implemented foundation for the unified Windows-first DemumuMind platform: CLI, local daemon, desktop shell, web control plane, capability registry, safe exploit packs, and Windows packaging scripts.
