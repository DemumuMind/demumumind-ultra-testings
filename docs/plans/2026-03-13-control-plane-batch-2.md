# Control Plane Batch 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add auth/policy/runner management to the web shell, deepen safe exploit packs, and improve the Windows installer experience without introducing unsafe defaults.

**Architecture:** Reuse the existing Fastify server as the control-plane API, extend the current React shell rather than adding routing, and keep scan proof generation behind a safe exploit-pack registry. Windows scripts remain the bootstrap and packaging entrypoints.

**Tech Stack:** TypeScript, Fastify, React 19, Vite, Vitest, Commander, Electron, PowerShell

---

### Task 1: Expand Backend Auth, Policy, And Runner Control APIs

**Files:**
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\server\src\build-server.ts`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\packages\core\src\runtime\runner-registry.ts`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\packages\shared\src\index.ts`
- Test: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\server\src\build-server.test.ts`

**Step 1: Write the failing tests**
- Add tests for auth status refresh/logout, project policy read/update, runner attach/update-status/detach/list, and richer runner fields.

**Step 2: Run the targeted tests to verify they fail**
- Run: `pnpm vitest run apps/server/src/build-server.test.ts`
- Expected: FAIL on missing runner lifecycle routes and richer response shapes.

**Step 3: Write the minimal implementation**
- Extend runner model and storage in `RunnerRegistry`.
- Add/update routes in `build-server.ts`.
- Keep inputs validated and merge behavior explicit.

**Step 4: Run the targeted tests to verify they pass**
- Run: `pnpm vitest run apps/server/src/build-server.test.ts`
- Expected: PASS

### Task 2: Extend Web API Client And App State

**Files:**
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\api.ts`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\App.tsx`
- Test: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\app-shell.test.tsx`

**Step 1: Write the failing tests**
- Add tests that require auth state, policy state, richer runner data, and safe exploit pack visibility to render in the shell.

**Step 2: Run the targeted tests to verify they fail**
- Run: `pnpm vitest run apps/web/src/app-shell.test.tsx`
- Expected: FAIL on missing auth/policy/runner/exploit-pack UI data.

**Step 3: Write the minimal implementation**
- Extend API helpers for auth status, logout, policy load/update, runner update/detach, and exploit pack data.
- Add state and handlers in `App.tsx`.

**Step 4: Run the targeted tests to verify they pass**
- Run: `pnpm vitest run apps/web/src/app-shell.test.tsx`
- Expected: PASS

### Task 3: Upgrade The Web Shell UI

**Files:**
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\app-shell.tsx`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\styles.css`
- Test: `C:\Users\Romanchello\source\repo\demumu_shannon\apps\web\src\app-shell.test.tsx`

**Step 1: Write the failing tests**
- Require UI sections for operator auth, project policy editing, runner lifecycle controls, and exploit pack/coverage transparency.

**Step 2: Run the targeted tests to verify they fail**
- Run: `pnpm vitest run apps/web/src/app-shell.test.tsx`
- Expected: FAIL

**Step 3: Write the minimal implementation**
- Keep one-shell layout.
- Add explicit panels and controls for auth, policy, runners, and exploit packs.
- Preserve the current visual language.

**Step 4: Run the targeted tests to verify they pass**
- Run: `pnpm vitest run apps/web/src/app-shell.test.tsx`
- Expected: PASS

### Task 4: Add Safe Exploit Pack Registry And Scan Integration

**Files:**
- Create: `C:\Users\Romanchello\source\repo\demumu_shannon\packages\core\src\scans\safe-exploit-pack-registry.ts`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\packages\core\src\scans\scan-orchestrator.ts`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\packages\core\src\scans\scan-orchestrator.test.ts`

**Step 1: Write the failing tests**
- Add tests proving reports include richer proof coverage mapped from safe exploit packs.

**Step 2: Run the targeted tests to verify they fail**
- Run: `pnpm vitest run packages/core/src/scans/scan-orchestrator.test.ts`
- Expected: FAIL

**Step 3: Write the minimal implementation**
- Add safe exploit pack registry.
- Use it to drive proof type and coverage metadata.

**Step 4: Run the targeted tests to verify they pass**
- Run: `pnpm vitest run packages/core/src/scans/scan-orchestrator.test.ts`
- Expected: PASS

### Task 5: Improve Windows Installer And Desktop Packaging UX

**Files:**
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\scripts\windows\install-demumumind.ps1`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\scripts\windows\package-desktop.ps1`
- Modify: `C:\Users\Romanchello\source\repo\demumu_shannon\package.json`

**Step 1: Write the failing verification expectation**
- Define a script-parse and packaging readiness check for the updated scripts.

**Step 2: Run the script verification to confirm the gap**
- Run: `[scriptblock]::Create((Get-Content scripts\\windows\\install-demumumind.ps1 -Raw)) | Out-Null; [scriptblock]::Create((Get-Content scripts\\windows\\package-desktop.ps1 -Raw)) | Out-Null`
- Expected: current scripts parse but do not expose the final UX steps required by the batch.

**Step 3: Write the minimal implementation**
- Add clearer staged output, prompts, desktop option flow, and final summaries.

**Step 4: Run packaging readiness checks**
- Run: `pnpm --filter @shannon/desktop exec electron --version`
- Run: `pnpm --filter @shannon/desktop exec electron-builder --version`
- Expected: PASS

### Task 6: Full Verification

**Files:**
- Verify existing modified files only

**Step 1: Run full tests**
- Run: `pnpm test`
- Expected: PASS

**Step 2: Run full typecheck**
- Run: `pnpm typecheck`
- Expected: PASS

**Step 3: Run full build**
- Run: `pnpm build`
- Expected: PASS
