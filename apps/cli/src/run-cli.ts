import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { homedir, hostname, networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CcsCodexService,
  EnvironmentDoctor,
  ProviderCatalogService
} from "@shannon/core";
import { TemporalPipelineClient, type WorkflowRuntimeClient } from "@shannon/worker";
import type { ShannonApiClient } from "./api-client.js";
import { clearSession, loadSession, saveSession } from "./session-store.js";

interface RunCliDependencies {
  apiClient?: ShannonApiClient;
  pipelineClient?: WorkflowRuntimeClient;
  ccsService?: Pick<
    CcsCodexService,
    "getStatus" | "runOpenAiConnectAttached" | "runDashboardAttached"
  >;
  providerCatalog?: Pick<ProviderCatalogService, "list">;
  environmentDoctor?: Pick<EnvironmentDoctor, "inspect">;
  serverBaseUrl?: string;
  sessionFilePath?: string;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  checkRuntimeHealth?: () => Promise<boolean>;
  startRuntime?: () => Promise<void>;
}

const DEFAULT_USER_ID = "local-cli-user";
const CLI_MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CLI_MODULE_DIRECTORY, "../../..");
const RUNTIME_READY_MAX_ATTEMPTS = 40;
const RUNTIME_READY_POLL_INTERVAL_MS = 250;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1", "::"]);

interface RuntimeBootstrapPlan {
  kind: "custom-command" | "docker-compose";
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: boolean;
}

const ASCII_SPLASH = [
  "  ███████╗██╗  ██╗ █████╗ ███╗   ██╗███╗   ██╗ ██████╗ ███╗   ██╗",
  "  ██╔════╝██║  ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗████╗  ██║",
  "  ███████╗███████║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██╔██╗ ██║",
  "  ╚════██║██╔══██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║╚██╗██║",
  "  ███████║██║  ██║██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██║ ╚████║",
  "  ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝"
].join("\n");

export const CLI_QUICK_START_HELP = `
Quick Start

  git clone https://github.com/DemumuMind/demumumind-ultra-testings.git
  cd demumumind-ultra-testings
  corepack enable
  pnpm install
  pnpm build

  Configure providers (choose one)
  ./demumu login --provider openai
  ./demumu config
  export OPENAI_API_KEY="your-api-key"

  Start a workflow
  ./demumu start URL=https://example.com REPO=repo-name

  Monitor progress
  ./demumu logs ID=workflow-1234567890
  ./demumu query ID=workflow-1234567890
  ./demumu workspaces

  Stop the local runtime
  ./demumu stop
  ./demumu stop CLEAN=true
`;

function renderHelp(): string {
  return [
    ASCII_SPLASH,
    "",
    "SHANNON",
    "",
    "AI Penetration Testing Framework",
    "",
    "Usage:",
    "  ./demumu start URL=<url> REPO=<name> [CONFIG=<path>] [OUTPUT=<path>] [WORKSPACE=<name>]",
    "  ./demumu workspaces",
    "  ./demumu logs ID=<workflow-id>",
    "  ./demumu query ID=<workflow-id>",
    "  ./demumu stop [CLEAN=true]",
    "  ./demumu config",
    "  ./demumu help",
    "",
    "Provider auth:",
    "  ./demumu login --provider openai",
    "  Set NVIDIA_API_KEY for NVIDIA access",
    "",
    CLI_QUICK_START_HELP.trim()
  ].join("\n");
}

function resolveSessionFilePath(override?: string): string {
  return override ?? join(homedir(), ".demumumind", "session.json");
}

function resolveServerBaseUrl(override?: string): string {
  return (
    override ??
    process.env.DEMUMUMIND_SERVER_URL ??
    process.env.SHANNON_SERVER_URL ??
    "http://127.0.0.1:4000"
  );
}

function normalizeHost(host: string): string {
  return host.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function collectLocalAddresses(): string[] {
  const entries = Object.values(networkInterfaces()).flatMap((interfaces) => interfaces ?? []);
  return entries
    .map((entry) => entry.address)
    .filter((address): address is string => typeof address === "string")
    .map(normalizeHost);
}

function resolveRuntimePort(url: URL): string {
  if (url.port) {
    return url.port;
  }

  return url.protocol === "https:" ? "443" : "80";
}

function normalizeCliArgv(argv: string[]): string[] {
  const normalized = [...argv];

  for (let index = 2; index < normalized.length; index += 1) {
    if (normalized[index]?.startsWith("/")) {
      normalized[index] = normalized[index]!.slice(1);
    }
  }

  return normalized;
}

function parseKeyValueArgs(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};

  for (const arg of args) {
    const separatorIndex = arg.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = arg.slice(0, separatorIndex).trim().toUpperCase();
    const value = arg.slice(separatorIndex + 1).trim();

    if (key) {
      values[key] = value;
    }
  }

  return values;
}

function parseFlagArgs(args: string[]): {
  flags: Set<string>;
  values: Record<string, string>;
} {
  const flags = new Set<string>();
  const values: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current?.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = args[index + 1];

    if (!next || next.startsWith("--")) {
      flags.add(key);
      continue;
    }

    values[key] = next;
    index += 1;
  }

  return {
    flags,
    values
  };
}

function resolveBootstrapCommand(override?: string): string | undefined {
  const value =
    override ??
    process.env.DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND ??
    process.env.SHANNON_SERVER_BOOTSTRAP_COMMAND;
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export async function isLocalServerBaseUrl(serverBaseUrl: string): Promise<boolean> {
  try {
    const url = new URL(serverBaseUrl);

    if (url.protocol !== "http:") {
      return false;
    }

    const host = normalizeHost(url.hostname);

    if (LOOPBACK_HOSTS.has(host)) {
      return true;
    }

    const machineHost = normalizeHost(hostname());

    if (host === machineHost) {
      return true;
    }

    const localAddresses = new Set(collectLocalAddresses());

    if (localAddresses.has(host)) {
      return true;
    }

    try {
      const resolved = await lookup(url.hostname, {
        all: true,
        verbatim: true
      });

      return resolved.some((entry) => localAddresses.has(normalizeHost(entry.address)));
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function probeRuntimeHealth(serverBaseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", serverBaseUrl), {
      method: "GET"
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: string };
    return payload.status === "ok";
  } catch {
    return false;
  }
}

export function buildRuntimeBootstrapPlan(input: {
  serverBaseUrl: string;
  projectRoot?: string;
  bootstrapCommand?: string;
  forceLocal?: boolean;
}): RuntimeBootstrapPlan | null {
  const projectRoot = input.projectRoot ?? PROJECT_ROOT;
  const bootstrapCommand = resolveBootstrapCommand(input.bootstrapCommand);
  const url = new URL(input.serverBaseUrl);
  const runtimeEnv = {
    ...process.env,
    DEMUMUMIND_SERVER_URL: input.serverBaseUrl,
    SHANNON_SERVER_URL: input.serverBaseUrl,
    HOST: url.hostname,
    PORT: resolveRuntimePort(url)
  };

  if (bootstrapCommand) {
    return {
      kind: "custom-command",
      command: bootstrapCommand,
      args: [],
      cwd: projectRoot,
      env: runtimeEnv,
      shell: true
    };
  }

  if (!input.forceLocal) {
    return null;
  }

  return {
    kind: "docker-compose",
    command: "docker",
    args: ["compose", "up", "temporal", "worker", "-d"],
    cwd: projectRoot,
    env: runtimeEnv,
    shell: false
  };
}

async function startRuntimeProcess(serverBaseUrl: string): Promise<void> {
  const runtimePlan = buildRuntimeBootstrapPlan({
    serverBaseUrl,
    forceLocal: await isLocalServerBaseUrl(serverBaseUrl)
  });

  if (!runtimePlan) {
    throw new Error(
      "Daemon is unavailable and no bootstrap strategy is configured. Start it manually or set `DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND`."
    );
  }

  const child = spawn(runtimePlan.command, runtimePlan.args, {
    cwd: runtimePlan.cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: runtimePlan.env,
    shell: runtimePlan.shell
  });

  child.unref();
}

async function ensureRuntimeReady(input: {
  serverBaseUrl: string;
  writeStdout: (line: string) => void;
  sleep: (milliseconds: number) => Promise<void>;
  checkRuntimeHealth: () => Promise<boolean>;
  startRuntime: () => Promise<void>;
}): Promise<void> {
  if (await input.checkRuntimeHealth()) {
    return;
  }

  const hasBootstrapStrategy =
    Boolean(resolveBootstrapCommand()) || (await isLocalServerBaseUrl(input.serverBaseUrl));

  if (!hasBootstrapStrategy) {
    throw new Error(
      "Daemon is unavailable and cannot be auto-started for this server URL. Start it manually or set `DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND`."
    );
  }

  input.writeStdout("Daemon is unavailable. Starting it now...");
  await input.startRuntime();

  for (let attempt = 0; attempt < RUNTIME_READY_MAX_ATTEMPTS; attempt += 1) {
    if (await input.checkRuntimeHealth()) {
      return;
    }

    await input.sleep(RUNTIME_READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    "Daemon did not become ready in time. Inspect the server logs or start it manually."
  );
}

async function requireSessionUserId(sessionFilePath: string): Promise<string> {
  const session = await loadSession(sessionFilePath);
  return session?.userId ?? DEFAULT_USER_ID;
}

function printJson(writeStdout: (line: string) => void, value: unknown): void {
  writeStdout(JSON.stringify(value, null, 2));
}

function printWorkflowSummary(
  writeStdout: (line: string) => void,
  workflow: {
    id: string;
    targetUrl: string;
    repoPath: string;
    workspace: string;
    reportPath: string;
  }
): void {
  writeStdout(`Workflow started: ${workflow.id}`);
  writeStdout("");
  writeStdout(`Target:      ${workflow.targetUrl}`);
  writeStdout(`Repository:  ${workflow.repoPath}`);
  writeStdout(`Workspace:   ${workflow.workspace}`);
  writeStdout("");
  writeStdout("Monitor progress:");
  writeStdout(`  Web UI:  http://127.0.0.1:4000/api/workflows/${workflow.id}`);
  writeStdout(`  Logs:    ./demumu logs ID=${workflow.id}`);
  writeStdout(`  Query:   ./demumu query ID=${workflow.id}`);
  writeStdout("");
  writeStdout(`Output: ${workflow.reportPath}`);
}

export async function runCli(argv: string[], dependencies: RunCliDependencies = {}): Promise<number> {
  const serverBaseUrl = resolveServerBaseUrl(dependencies.serverBaseUrl);
  const pipelineClient =
    dependencies.pipelineClient ??
    (dependencies.apiClient as unknown as WorkflowRuntimeClient | undefined) ??
    new TemporalPipelineClient();
  const ccsService = dependencies.ccsService ?? new CcsCodexService();
  const providerCatalog =
    dependencies.providerCatalog ?? new ProviderCatalogService({ ccsService });
  const environmentDoctor =
    dependencies.environmentDoctor ?? new EnvironmentDoctor({ ccsService });
  const sessionFilePath = resolveSessionFilePath(dependencies.sessionFilePath);
  const writeStdout = dependencies.writeStdout ?? ((line: string) => console.log(line));
  const writeStderr = dependencies.writeStderr ?? ((line: string) => console.error(line));
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const checkRuntimeHealth =
    dependencies.checkRuntimeHealth ??
    (dependencies.pipelineClient || dependencies.apiClient
      ? async () => true
      : () => pipelineClient.checkRuntimeHealth());
  const startRuntime = dependencies.startRuntime ?? (() => startRuntimeProcess(serverBaseUrl));

  const normalized = normalizeCliArgv(argv);
  const command = normalized[2]?.toLowerCase();
  const args = normalized.slice(3);

  if (!command || command === "help") {
    writeStdout(renderHelp());
    return 0;
  }

  try {
    switch (command) {
      case "start": {
        const kv = parseKeyValueArgs(args);
        const url = kv.URL;
        const repo = kv.REPO;

        if (!url || !repo) {
          throw new Error("Usage: ./demumu start URL=<url> REPO=<name> [CONFIG=<path>] [OUTPUT=<path>] [WORKSPACE=<name>]");
        }

        await ensureRuntimeReady({
          serverBaseUrl,
          writeStdout,
          sleep,
          checkRuntimeHealth,
          startRuntime
        });

        const workflow = await pipelineClient.startWorkflow({
          userId: await requireSessionUserId(sessionFilePath),
          url,
          repo,
          config: kv.CONFIG,
          output: kv.OUTPUT,
          workspace: kv.WORKSPACE
        });
        printWorkflowSummary(writeStdout, workflow);
        return 0;
      }

      case "query": {
        const kv = parseKeyValueArgs(args);
        const workflowId = kv.ID;

        if (!workflowId) {
          throw new Error("Usage: ./demumu query ID=<workflow-id>");
        }

        printJson(writeStdout, await pipelineClient.getWorkflow(workflowId));
        return 0;
      }

      case "logs": {
        const kv = parseKeyValueArgs(args);
        const workflowId = kv.ID;

        if (!workflowId) {
          throw new Error("Usage: ./demumu logs ID=<workflow-id>");
        }

        const response = await pipelineClient.getWorkflowLogs(workflowId);

        for (const line of response.logs) {
          writeStdout(line);
        }

        return 0;
      }

      case "workspaces": {
        const workspaces = await pipelineClient.getWorkspaces();

        if (workspaces.length === 0) {
          writeStdout("No workspaces found.");
          return 0;
        }

        for (const workspace of workspaces) {
          writeStdout(
            `${workspace.name}  ${workspace.status}  ${workspace.lastWorkflowId ?? "none"}  ${workspace.targetUrl}`
          );
        }

        return 0;
      }

      case "stop": {
        const kv = parseKeyValueArgs(args);
        const clean = kv.CLEAN?.toLowerCase() === "true";
        const result = await pipelineClient.stopRuntime({
          clean
        });
        writeStdout(result.message);
        return 0;
      }

      case "providers": {
        const providers = await providerCatalog.list();

        for (const provider of providers) {
          writeStdout(
            `${provider.label} (${provider.kind}): ${provider.status} [${provider.authStrategies.join(" -> ")}]`
          );
        }

        return 0;
      }

      case "doctor": {
        const report = await environmentDoctor.inspect();

        writeStdout(`Doctor status: ${report.status}`);
        writeStdout("");

        for (const check of report.checks) {
          writeStdout(`- ${check.label}: ${check.status} - ${check.summary}`);

          if (check.remediation) {
            writeStdout(`  remediation: ${check.remediation}`);
          }
        }

        return 0;
      }

      case "config": {
        writeStdout("CCS dashboard started. Press Ctrl+C to stop.");
        const exitCode = await ccsService.runDashboardAttached();

        if (exitCode !== 0) {
          throw new Error(`ccs config exited with code ${exitCode}`);
        }

        return 0;
      }

      case "login": {
        const { flags, values } = parseFlagArgs(args);
        const provider =
          values.provider === "nvidia" || values.provider === "openai"
            ? values.provider
            : "openai";
        const userId = values.user ?? DEFAULT_USER_ID;

        if (
          flags.has("device-auth") ||
          flags.has("browser-auth") ||
          Object.hasOwn(values, "callback-host") ||
          Object.hasOwn(values, "callback-port")
        ) {
          throw new Error(
            "OpenAI login now goes through CCS. Use `./demumu login --provider openai` or `./demumu config`."
          );
        }

        if (provider === "nvidia") {
          throw new Error(
            "NVIDIA uses manual authentication only. Set `NVIDIA_API_KEY` instead of using `./demumu login`."
          );
        }

        const exitCode = await ccsService.runOpenAiConnectAttached();

        if (exitCode !== 0) {
          throw new Error(`ccs codex --auth --add exited with code ${exitCode}`);
        }

        await saveSession(sessionFilePath, {
          userId
        });
        const ccsStatus = await ccsService.getStatus();
        writeStdout("OpenAI is now configured through CCS.");
        writeStdout(`CCS profile: ${ccsStatus.settingsPath}`);
        return 0;
      }

      case "logout": {
        await clearSession(sessionFilePath);
        writeStdout(
          "Broker logout has been removed. Manage OpenAI access through `ccs config` or by updating your CCS profile."
        );
        return 0;
      }

      case "whoami": {
        const status = await ccsService.getStatus();

        if (!status.profileConfigured) {
          writeStdout("OpenAI via CCS is not configured.");
          return 0;
        }

        writeStdout(`OpenAI via CCS is configured: ${status.settingsPath}`);
        return 0;
      }

      default:
        writeStderr(`Unknown command: ${command}`);
        writeStdout(renderHelp());
        return 1;
    }
  } catch (error) {
    writeStderr((error as Error).message);
    return 1;
  }
}
