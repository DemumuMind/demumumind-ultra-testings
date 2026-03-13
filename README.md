# Demumu Shannon

Shannon-style workflow runner for white-box AppSec testing of web applications and APIs.

This repository is now centered on a CLI-first run model:
- start a workflow from the terminal
- inspect logs and workflow details from the terminal
- review the same run in a statistics-focused web dashboard

The first implementation wave keeps the runtime in TypeScript and constrains provider support to:
- `OpenAI`
- `NVIDIA`

Browser/device auth is the preferred connection path. Environment variables remain available as a fallback for headless and CI usage.

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

`demumu start` automatically boots the daemon when it is not already running.

- For local HTTP URLs, the CLI starts the bundled server directly.
- If `apps/server/dist/index.js` is missing, the CLI falls back to starting `apps/server/src/index.ts` through `tsx`.
- For custom or remote `DEMUMUMIND_SERVER_URL` values, set `DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND` to teach the CLI how to start that daemon.

Preferred path:

```bash
./demumu login --device-auth --provider openai
```

Fallback path for headless and CI:

```bash
export OPENAI_API_KEY="your-api-key"
export NVIDIA_API_KEY="your-api-key"
export NVIDIA_BASE_URL="https://integrate.api.nvidia.com/v1"
```

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
demumu login --device-auth --provider openai
demumu login --provider nvidia
demumu logout
demumu whoami
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
1. Browser OAuth
2. Device authorization
3. Manual environment variables

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
