# Demumu Shannon

Shannon-style workflow runner for white-box AppSec testing of web applications and APIs.

This repository is now centered on a CLI-first run model:
- start a workflow from the terminal
- inspect logs and workflow details from the terminal
- review the same run in a statistics-focused web dashboard

The first implementation wave keeps the runtime in TypeScript and constrains provider support to:
- `OpenAI`
- `NVIDIA`

`CCS Codex` is the preferred OpenAI connection path. Manual environment variables remain available as a fallback for headless and CI usage.

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/DemumuMind/demumumind-ultra-testings.git
cd demumumind-ultra-testings
corepack enable
pnpm install
pnpm build
```

### 2. Configure providers

`demumu start` automatically boots the local Temporal runtime when it is not already running.

- By default, the CLI starts the local Docker runtime with `docker compose up temporal worker -d`.
- For custom or remote `DEMUMUMIND_SERVER_URL` values, set `DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND` to teach the CLI how to start that runtime.

Preferred path:

```bash
./demumu login --provider openai
./demumu config
```

Fallback path for headless and CI:

```bash
export OPENAI_API_KEY="your-api-key"
export NVIDIA_API_KEY="your-api-key"
export NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
```

Windows note for CCS OAuth:

```powershell
netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455
```

If browser auth hangs, run the firewall rule above as Administrator and retry. `ccs config` starts the CCS dashboard at `http://localhost:3000` and CLIProxy on `localhost:8317`.

### 3. Run a workflow

Place the target repository inside `./repos/` and use the folder name as `REPO`.

```bash
./demumu start URL=https://example.com REPO=repo-name
```

Optional arguments:

```bash
./demumu start URL=https://example.com REPO=repo-name WORKSPACE=q1-audit
./demumu start URL=https://example.com REPO=repo-name OUTPUT=./audit-logs
./demumu start URL=https://example.com REPO=repo-name CONFIG=./configs/my-config.yaml
```

### 4. Monitor the workflow

```bash
./demumu logs ID=<workflow-id>
./demumu query ID=<workflow-id>
./demumu workspaces
```

### 5. Stop the local runtime

```bash
./demumu stop
./demumu stop CLEAN=true
```

## Command Surface

Primary Shannon-style commands:

```text
demumu start URL=<url> REPO=<name> [CONFIG=<path>] [OUTPUT=<path>] [WORKSPACE=<name>]
demumu logs ID=<workflow-id>
demumu query ID=<workflow-id>
demumu stop [CLEAN=true]
demumu workspaces
demumu help
```

Provider connection helpers:

```text
demumu login --provider openai
demumu config
demumu whoami
demumu doctor
demumu providers
```

Compatibility notes:
- `doctor` remains as a lightweight compatibility command and prints provider readiness.
- older `pnpm exec demumumind ...` flows are no longer the primary documented path.
- `DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND` can be used to auto-start a non-default daemon target before `start`.

## Web Dashboard

Run the dashboard in a second terminal:

```bash
pnpm dev:web
```

The web app is intentionally narrow in scope:
- workflow list
- workspace list
- workflow detail summary
- phase history
- log view
- findings and agent breakdown
- OpenAI via CCS status, connect, and dashboard controls

It is no longer the primary place for broad control-plane administration in v1.

## Platform Support

### PowerShell

```powershell
corepack enable
pnpm install
pnpm build
.\demumu.ps1 start URL=https://example.com REPO=repo-name
```

### CMD

```cmd
corepack enable
pnpm install
pnpm build
demumu.cmd start URL=https://example.com REPO=repo-name
```

### Git Bash / Shell

```bash
corepack enable
pnpm install
pnpm build
./demumu start URL=https://example.com REPO=repo-name
```

### WSL

```bash
corepack enable
pnpm install
pnpm build
./demumu start URL=https://example.com REPO=repo-name
```

For WSL, keep the repository inside the Linux filesystem when possible for better tooling and file performance.

## Repository Layout for Targets

The CLI expects target repositories under `./repos/` by default.

Examples:

```bash
git clone https://github.com/your-org/your-repo.git ./repos/your-repo
./demumu start URL=https://your-app.com REPO=your-repo
```

```bash
mkdir -p ./repos/your-app
git clone https://github.com/your-org/frontend.git ./repos/your-app/frontend
git clone https://github.com/your-org/backend.git ./repos/your-app/backend
```

The target path must be a git repository. If `.git` is missing, workflow start fails early with a clear validation error.

## Providers

Only these providers are supported in v1:
- `OpenAI`
- `NVIDIA`

Provider metadata is intentionally fixed in the product surface and dashboard.

Preferred auth order:
1. CCS Codex
2. Manual environment variables

## Migration from the Old CLI

Old:

```bash
pnpm exec demumumind /project init ...
pnpm exec demumumind /scan start --project-id ...
pnpm exec demumumind /report open --scan-run-id ...
```

New primary flow:

```bash
./demumu start URL=https://example.com REPO=repo-name
./demumu logs ID=<workflow-id>
./demumu query ID=<workflow-id>
```

The old slash-driven control-plane workflow is no longer the main product story.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

## Rust

Rust is intentionally deferred from the first implementation wave.

The current codebase keeps clean launcher and runtime boundaries so native Rust helpers can be added later for performance-sensitive tasks without rewriting the v1 product around Rust today.
