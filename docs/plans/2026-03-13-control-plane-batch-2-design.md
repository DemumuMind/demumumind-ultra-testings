# Control Plane Batch 2 Design

**Date:** 2026-03-13

## Goal
Extend DemumuMind Ultra Testings from a foundation control plane into a usable Windows-first operator console with richer auth, policy, runner management, safe exploit pack transparency, and improved installer UX.

## Recommended Approach
Expand the existing `apps/web` shell and the existing local Fastify API instead of introducing routing, a new desktop-native UX layer, or a second control plane. Keep the control plane proof-first and safe-by-default.

## Scope

### 1. Auth UI
- Add explicit operator auth state to the web shell.
- Support browser auth, device auth, polling, refresh, and logout from the UI.
- Show `connected`, `pending`, and `disconnected` states clearly.

### 2. Policy UI
- Read and update project policy from the web shell.
- Expose `activeValidationAllowed`, `destructiveChecksEnabled`, and allowed exploit classes.
- Keep server-side merge behavior explicit so the UI does not accidentally erase allow-listed classes.

### 3. Runner Management
- Expand the runner model to include `name`, `endpoint`, `mode`, `status`, `lastSeenAt`, and `managed`.
- Support attach, update-status, detach, and refresh operations.
- Keep runner management strictly registration/status-oriented; do not introduce remote code execution.

### 4. Safe Exploit Packs
- Introduce a registry of built-in safe exploit packs for authentication, authorization, GraphQL, XSS, SSRF, and business-logic flows.
- Surface exploit pack coverage and proof type in reports and the web shell.
- Keep destructive behaviors gated by explicit policy and capability settings.

### 5. Installer UX
- Improve Windows PowerShell scripts with clearer staged output, prompts, doctor summaries, Electron bootstrap, and desktop packaging flow.
- Avoid hidden actions so failures remain diagnosable.

## Non-Goals For This Batch
- Full desktop-native Electron IPC architecture beyond the existing web shell host
- Remote runner execution
- Unbounded destructive testing
- Public repo cleanup, release notes, and final push

## Risks And Guardrails
- Auth, policy, and runner APIs are security-sensitive and must reject malformed updates clearly.
- UI changes should preserve the existing single-shell experience.
- Safe exploit packs must not overclaim confirmation without proof artifacts.
- Installer scripts must remain Windows-first and transparent.
