import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { homedir, hostname, networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FetchShannonApiClient, type ShannonApiClient } from "./api-client.js";
import {
  startLocalCallbackServer,
  type BrowserCallbackServer
} from "./browser-callback-server.js";
import { clearSession, loadSession, saveSession } from "./session-store.js";

interface RunCliDependencies {
  apiClient?: ShannonApiClient;
  serverBaseUrl?: string;
  sessionFilePath?: string;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  checkRuntimeHealth?: () => Promise<boolean>;
  startRuntime?: () => Promise<void>;
  createBrowserCallbackServer?: (input: {
    host: string;
    port: number;
    callbackPath: string;
  }) => Promise<BrowserCallbackServer>;
  openBrowser?: (url: string) => Promise<boolean>;
}

const DEFAULT_USER_ID = "local-cli-user";
const CLI_MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(CLI_MODULE_DIRECTORY, "../../..");
const RUNTIME_READY_MAX_ATTEMPTS = 40;
const RUNTIME_READY_POLL_INTERVAL_MS = 250;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1", "::"]);

interface RuntimeBootstrapPlan {
  kind: "custom-command" | "node-dist" | "node-tsx" | "pnpm-tsx";
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
  ./demumu login --device-auth --provider openai
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
    "  ./demumu help",
    "",
    "Provider auth:",
    "  ./demumu login --device-auth --provider openai",
    "  ./demumu login --provider nvidia",
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

async function openBrowserUrl(url: string): Promise<boolean> {
  try {
    let command = "xdg-open";
    let args = [url];

    if (process.platform === "win32") {
      command = "cmd.exe";
      args = ["/c", "start", "", url];
    } else if (process.platform === "darwin") {
      command = "open";
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
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
  distExists?: boolean;
  sourceExists?: boolean;
  tsxAvailable?: boolean;
  forceLocal?: boolean;
  platform?: NodeJS.Platform;
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

  const serverEntryPoint = join(projectRoot, "apps", "server", "dist", "index.js");
  const sourceEntryPoint = join(projectRoot, "apps", "server", "src", "index.ts");
  const distExists = input.distExists ?? existsSync(serverEntryPoint);
  const sourceExists = input.sourceExists ?? existsSync(sourceEntryPoint);
  const tsxAvailable = input.tsxAvailable ?? existsSync(join(projectRoot, "node_modules", "tsx"));

  if (!input.forceLocal) {
    return null;
  }

  if (distExists) {
    return {
      kind: "node-dist",
      command: process.execPath,
      args: [serverEntryPoint],
      cwd: projectRoot,
      env: runtimeEnv,
      shell: false
    };
  }

  if (sourceExists && tsxAvailable) {
    return {
      kind: "node-tsx",
      command: process.execPath,
      args: ["--import", "tsx", sourceEntryPoint],
      cwd: projectRoot,
      env: runtimeEnv,
      shell: false
    };
  }

  if (sourceExists) {
    return {
      kind: "pnpm-tsx",
      command: (input.platform ?? process.platform) === "win32" ? "pnpm.cmd" : "pnpm",
      args: ["exec", "tsx", sourceEntryPoint],
      cwd: projectRoot,
      env: runtimeEnv,
      shell: false
    };
  }

  return null;
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
  const apiClient =
    dependencies.apiClient ??
    new FetchShannonApiClient(serverBaseUrl);
  const sessionFilePath = resolveSessionFilePath(dependencies.sessionFilePath);
  const writeStdout = dependencies.writeStdout ?? ((line: string) => console.log(line));
  const writeStderr = dependencies.writeStderr ?? ((line: string) => console.error(line));
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const checkRuntimeHealth =
    dependencies.checkRuntimeHealth ?? (() => probeRuntimeHealth(serverBaseUrl));
  const startRuntime = dependencies.startRuntime ?? (() => startRuntimeProcess(serverBaseUrl));
  const createBrowserCallbackServer =
    dependencies.createBrowserCallbackServer ?? startLocalCallbackServer;
  const openBrowser = dependencies.openBrowser ?? openBrowserUrl;

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

        const workflow = await apiClient.startWorkflow({
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

        printJson(writeStdout, await apiClient.getWorkflow(workflowId));
        return 0;
      }

      case "logs": {
        const kv = parseKeyValueArgs(args);
        const workflowId = kv.ID;

        if (!workflowId) {
          throw new Error("Usage: ./demumu logs ID=<workflow-id>");
        }

        const response = await apiClient.getWorkflowLogs(workflowId);

        for (const line of response.logs) {
          writeStdout(line);
        }

        return 0;
      }

      case "workspaces": {
        const workspaces = await apiClient.getWorkspaces();

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
        const result = await apiClient.stopRuntime({
          clean
        });
        writeStdout(result.message);
        return 0;
      }

      case "doctor":
      case "providers": {
        const providers = await apiClient.getProviders();

        for (const provider of providers) {
          writeStdout(
            `${provider.label} (${provider.kind}): ${provider.status} [${provider.authStrategies.join(" -> ")}]`
          );
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

        if (flags.has("device-auth")) {
          const started = await apiClient.startDeviceLogin(userId, provider);
          writeStdout(`Open this URL in your browser: ${started.verificationUri}`);
          writeStdout(`Enter this code: ${started.userCode}`);

          for (;;) {
            const polled = await apiClient.pollDeviceLogin({
              userId,
              sessionId: started.sessionId
            });

            if (polled.status === "connected") {
              await saveSession(sessionFilePath, {
                userId
              });
              writeStdout(`Connected as ${polled.connection.profile.email}`);
              return 0;
            }

            await sleep(Math.max(started.intervalSeconds, 0) * 1000);
          }
        }

        const callbackHost = values["callback-host"] ?? "127.0.0.1";
        const callbackPort = Number(values["callback-port"] ?? "1455");

        if (!Number.isInteger(callbackPort) || callbackPort <= 0) {
          throw new Error("--callback-port must be a positive integer");
        }

        const callbackServer = await createBrowserCallbackServer({
          host: callbackHost,
          port: callbackPort,
          callbackPath: "/auth/callback"
        });
        writeStdout(
          `Starting local login server on ${callbackServer.redirectUri.replace("/auth/callback", "")}.`
        );

        try {
          const started = await apiClient.startBrowserLogin(userId, provider, callbackServer.redirectUri);
          const opened = await openBrowser(started.authorizationUrl);

          if (!opened) {
            writeStdout("If your browser did not open, navigate to this URL to authenticate:");
          }

          writeStdout(started.authorizationUrl);

          const callback = await callbackServer.waitForCallback();
          const completed = await apiClient.completeBrowserLogin({
            userId,
            code: callback.code,
            state: callback.state
          });
          await saveSession(sessionFilePath, {
            userId
          });
          writeStdout(`Connected as ${completed.profile.email}`);
          return 0;
        } finally {
          await callbackServer.close();
        }
      }

      case "logout": {
        const userId = await requireSessionUserId(sessionFilePath);
        await apiClient.logout(userId);
        await clearSession(sessionFilePath);
        writeStdout("Logged out");
        return 0;
      }

      case "whoami": {
        const session = await loadSession(sessionFilePath);

        if (!session) {
          writeStdout("Not connected");
          return 0;
        }

        const connection = await apiClient.getConnection(session.userId);

        if (!connection) {
          writeStdout(`Session exists for ${session.userId}, but no server-side connection is linked.`);
          return 0;
        }

        writeStdout(`${connection.profile.name} <${connection.profile.email}>`);
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
