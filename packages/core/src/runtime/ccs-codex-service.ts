import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createServer, Socket } from "node:net";
import type { CcsActiveProcess, CcsStatus } from "@shannon/shared";

const DEFAULT_CALLBACK_PORT = 1455;
const DEFAULT_DASHBOARD_URL = "http://localhost:3000";
const DEFAULT_CLI_PROXY_HOST = "127.0.0.1";
const DEFAULT_CLI_PROXY_PORT = 8317;
const DEFAULT_LOG_LIMIT = 100;
export const CCS_FIREWALL_FIX_COMMAND =
  'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455';

type ManagedProcessKind = "connect" | "dashboard";

interface ManagedProcessRecord {
  kind: ManagedProcessKind;
  child: ChildProcess;
  state: Exclude<CcsActiveProcess, "idle">;
  stopRequested: boolean;
}

interface SpawnProcessInput {
  command: string;
  args: string[];
  shell: boolean;
  stdio: "pipe" | "inherit" | "ignore";
}

interface CcsCodexServiceOptions {
  homeDir?: string;
  platform?: NodeJS.Platform | string;
  callbackPort?: number;
  dashboardUrl?: string;
  cliProxyHost?: string;
  cliProxyPort?: number;
  detectBinary?: () => Promise<boolean>;
  fileExists?: (path: string) => boolean | Promise<boolean>;
  probeDashboard?: (url: string) => Promise<boolean>;
  probeCliProxy?: (host: string, port: number) => Promise<boolean>;
  checkCallbackPort?: (port: number) => Promise<boolean>;
  checkLocalhostBinding?: () => Promise<boolean>;
  spawnProcess?: (input: SpawnProcessInput) => ChildProcess | Promise<ChildProcess>;
  logLimit?: number;
}

function defaultSpawnProcess(input: SpawnProcessInput): ChildProcess {
  return spawn(input.command, input.args, {
    shell: input.shell,
    stdio: input.stdio,
    windowsHide: true
  });
}

async function defaultDetectBinary(platform: NodeJS.Platform | string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = defaultSpawnProcess({
      command: "ccs",
      args: ["--version"],
      shell: platform === "win32",
      stdio: "ignore"
    });

    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

async function defaultProbeDashboard(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET"
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function probeTcpEndpoint(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    const finish = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function checkLocalhostBinding(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(0, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

export class CcsCodexService {
  private readonly homeDir: string;
  private readonly platform: NodeJS.Platform | string;
  private readonly callbackPort: number;
  private readonly dashboardUrl: string;
  private readonly cliProxyHost: string;
  private readonly cliProxyPort: number;
  private readonly detectBinary: () => Promise<boolean>;
  private readonly fileExists: (path: string) => boolean | Promise<boolean>;
  private readonly probeDashboard: (url: string) => Promise<boolean>;
  private readonly probeCliProxy: (host: string, port: number) => Promise<boolean>;
  private readonly checkCallbackPort: (port: number) => Promise<boolean>;
  private readonly checkLocalhostBinding: () => Promise<boolean>;
  private readonly spawnProcess: (input: SpawnProcessInput) => ChildProcess | Promise<ChildProcess>;
  private readonly logLimit: number;
  private readonly recentLogs: string[] = [];
  private dashboardProcess: ManagedProcessRecord | null = null;
  private latestManagedProcess: ManagedProcessRecord | null = null;
  private lastKnownProcessState: CcsActiveProcess = "idle";

  constructor(options: CcsCodexServiceOptions = {}) {
    this.homeDir = options.homeDir ?? homedir();
    this.platform = options.platform ?? process.platform;
    this.callbackPort = options.callbackPort ?? DEFAULT_CALLBACK_PORT;
    this.dashboardUrl = options.dashboardUrl ?? DEFAULT_DASHBOARD_URL;
    this.cliProxyHost = options.cliProxyHost ?? DEFAULT_CLI_PROXY_HOST;
    this.cliProxyPort = options.cliProxyPort ?? DEFAULT_CLI_PROXY_PORT;
    this.detectBinary = options.detectBinary ?? (() => defaultDetectBinary(this.platform));
    this.fileExists = options.fileExists ?? ((path) => existsSync(path));
    this.probeDashboard = options.probeDashboard ?? defaultProbeDashboard;
    this.probeCliProxy = options.probeCliProxy ?? probeTcpEndpoint;
    this.checkCallbackPort = options.checkCallbackPort ?? checkPortAvailable;
    this.checkLocalhostBinding = options.checkLocalhostBinding ?? checkLocalhostBinding;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
    this.logLimit = options.logLimit ?? DEFAULT_LOG_LIMIT;
  }

  getSettingsPath(): string {
    return join(this.homeDir, ".ccs", "codex.settings.json");
  }

  async getStatus(): Promise<CcsStatus> {
    const settingsPath = this.getSettingsPath();
    const [
      binaryReady,
      profileConfigured,
      dashboardRunning,
      cliProxyRunning,
      callbackPortReady,
      localhostBindable
    ] = await Promise.all([
      this.detectBinary(),
      this.fileExists(settingsPath),
      this.probeDashboard(this.dashboardUrl),
      this.probeCliProxy(this.cliProxyHost, this.cliProxyPort),
      this.checkCallbackPort(this.callbackPort),
      this.checkLocalhostBinding()
    ]);

    const firewallStatus = this.platform === "win32" ? "warn" : "unknown";
    const recommendedFixes: string[] = [];

    if (!profileConfigured) {
      recommendedFixes.push("Run `ccs codex --auth --add` to connect OpenAI through CCS.");
    }

    if (!dashboardRunning) {
      recommendedFixes.push("Run `ccs config` to start the CCS dashboard.");
    }

    if (!callbackPortReady) {
      recommendedFixes.push(
        `Port ${this.callbackPort} is unavailable. Free that port before starting CCS OAuth.`
      );
    }

    if (firewallStatus === "warn") {
      recommendedFixes.push(CCS_FIREWALL_FIX_COMMAND);
    }

    return {
      binaryReady,
      settingsPath,
      profileConfigured,
      dashboardUrl: this.dashboardUrl,
      dashboardRunning,
      cliProxyRunning,
      callbackPort: this.callbackPort,
      callbackPortReady,
      localhostBindable,
      firewallStatus,
      recentLogs: [...this.recentLogs],
      recommendedFixes,
      activeProcess: this.resolveActiveProcess(dashboardRunning)
    };
  }

  async startOpenAiConnect(): Promise<CcsStatus> {
    await this.startManagedProcess("connect", ["codex", "--auth", "--add"]);
    return this.getStatus();
  }

  async runOpenAiConnectAttached(): Promise<number> {
    return this.runAttached(["codex", "--auth", "--add"]);
  }

  async startDashboard(): Promise<CcsStatus> {
    if (this.dashboardProcess && !this.dashboardProcess.stopRequested) {
      return this.getStatus();
    }

    await this.startManagedProcess("dashboard", ["config"]);
    return this.getStatus();
  }

  async runDashboardAttached(): Promise<number> {
    return this.runAttached(["config"]);
  }

  async stopDashboard(): Promise<CcsStatus> {
    if (this.dashboardProcess) {
      this.dashboardProcess.stopRequested = true;
      this.dashboardProcess.child.kill();
      this.dashboardProcess = null;
      this.lastKnownProcessState = "idle";
    }

    return this.getStatus();
  }

  private async runAttached(args: string[]): Promise<number> {
    const child = await this.spawnProcess({
      command: "ccs",
      args,
      shell: this.platform === "win32",
      stdio: "inherit"
    });

    return new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  }

  private async startManagedProcess(kind: ManagedProcessKind, args: string[]): Promise<void> {
    const child = await this.spawnProcess({
      command: "ccs",
      args,
      shell: this.platform === "win32",
      stdio: "pipe"
    });
    const record: ManagedProcessRecord = {
      kind,
      child,
      state: "starting",
      stopRequested: false
    };

    this.latestManagedProcess = record;
    if (kind === "dashboard") {
      this.dashboardProcess = record;
    }
    this.lastKnownProcessState = "starting";

    this.attachLogStream(record, child.stdout);
    this.attachLogStream(record, child.stderr);

    child.once("error", (error) => {
      this.appendLog(`[ERROR] ${error.message}`);
      record.state = "failed";
      this.lastKnownProcessState = "failed";
      if (this.dashboardProcess === record) {
        this.dashboardProcess = null;
      }
    });

    child.once("exit", (code) => {
      if (record.stopRequested) {
        this.lastKnownProcessState = "idle";
      } else {
        this.lastKnownProcessState = code === 0 ? "succeeded" : "failed";
      }

      if (this.dashboardProcess === record) {
        this.dashboardProcess = null;
      }
      if (this.latestManagedProcess === record) {
        this.latestManagedProcess = null;
      }
    });
  }

  private attachLogStream(
    record: ManagedProcessRecord,
    stream: NodeJS.ReadableStream | null | undefined
  ): void {
    if (!stream) {
      return;
    }

    const reader = createInterface({
      input: stream
    });

    reader.on("line", (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      record.state = "running";
      this.lastKnownProcessState = "running";
      this.appendLog(trimmed);
    });
  }

  private appendLog(line: string): void {
    this.recentLogs.push(line);

    if (this.recentLogs.length > this.logLimit) {
      this.recentLogs.splice(0, this.recentLogs.length - this.logLimit);
    }
  }

  private resolveActiveProcess(dashboardRunning: boolean): CcsActiveProcess {
    if (this.dashboardProcess && !this.dashboardProcess.stopRequested) {
      return dashboardRunning ? "running" : this.dashboardProcess.state;
    }

    if (this.latestManagedProcess && !this.latestManagedProcess.stopRequested) {
      return this.latestManagedProcess.state;
    }

    return this.lastKnownProcessState;
  }
}
