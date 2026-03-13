import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { FetchShannonApiClient, type ShannonApiClient } from "./api-client.js";
import {
  startLocalCallbackServer,
  type BrowserCallbackServer
} from "./browser-callback-server.js";
import { clearSession, loadSession, saveSession } from "./session-store.js";

interface RunCliDependencies {
  apiClient?: ShannonApiClient;
  sessionFilePath?: string;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
  sleep?: (milliseconds: number) => Promise<void>;
  createBrowserCallbackServer?: (input: {
    host: string;
    port: number;
    callbackPath: string;
  }) => Promise<BrowserCallbackServer>;
  openBrowser?: (url: string) => Promise<boolean>;
}

const DEFAULT_USER_ID = "local-cli-user";

function resolveSessionFilePath(override?: string): string {
  return override ?? join(homedir(), ".demumumind", "session.json");
}

function normalizeCliArgv(argv: string[]): string[] {
  const normalized = [...argv];

  for (let index = 2; index < normalized.length; index += 1) {
    if (normalized[index]?.startsWith("/")) {
      normalized[index] = normalized[index]!.slice(1);
    }
  }

  if (normalized[2] === "scan" && normalized[3] === "start") {
    normalized[3] = "run";
  }

  if (normalized[2] === "report" && normalized[3] === "open") {
    normalized[3] = "export";
  }

  if (normalized[2] === "providers" && !normalized[3]) {
    normalized.splice(3, 0, "list");
  }

  if (normalized[2] === "capabilities" && !normalized[3]) {
    normalized.splice(3, 0, "list");
  }

  return normalized;
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

async function requireSessionUserId(sessionFilePath: string): Promise<string> {
  const session = await loadSession(sessionFilePath);

  if (!session) {
    throw new Error("No local session found. Run `auth login --device-auth` first.");
  }

  return session.userId;
}

function printJson(writeStdout: (line: string) => void, value: unknown): void {
  writeStdout(JSON.stringify(value, null, 2));
}

export async function runCli(argv: string[], dependencies: RunCliDependencies = {}): Promise<number> {
  const apiClient =
    dependencies.apiClient ??
    new FetchShannonApiClient(
      process.env.DEMUMUMIND_SERVER_URL ??
        process.env.SHANNON_SERVER_URL ??
        "http://127.0.0.1:4000"
    );
  const sessionFilePath = resolveSessionFilePath(dependencies.sessionFilePath);
  const writeStdout = dependencies.writeStdout ?? ((line: string) => console.log(line));
  const writeStderr = dependencies.writeStderr ?? ((line: string) => console.error(line));
  const sleep =
    dependencies.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const createBrowserCallbackServer =
    dependencies.createBrowserCallbackServer ?? startLocalCallbackServer;
  const openBrowser = dependencies.openBrowser ?? openBrowserUrl;
  const program = new Command();

  program
    .name("demumumind")
    .description("DemumuMind Ultra Testings CLI for Windows-first AppSec automation");

  program
    .command("login")
    .option("--device-auth", "Use OAuth device authorization")
    .option("--callback-host <host>", "Local callback host for browser login", "127.0.0.1")
    .option("--callback-port <port>", "Local callback port for browser login", "1455")
    .option("--user <userId>", "Local user identifier", DEFAULT_USER_ID)
    .action(
      async (options: {
        deviceAuth?: boolean;
        callbackHost: string;
        callbackPort: string;
        user: string;
      }) => {
        if (!options.deviceAuth) {
          const callbackPort = Number(options.callbackPort);

          if (!Number.isInteger(callbackPort) || callbackPort <= 0) {
            throw new Error("--callback-port must be a positive integer");
          }

          const callbackServer = await createBrowserCallbackServer({
            host: options.callbackHost,
            port: callbackPort,
            callbackPath: "/auth/callback"
          });
          writeStdout(
            `Starting local login server on ${callbackServer.redirectUri.replace("/auth/callback", "")}.`
          );

          try {
            const started = await apiClient.startBrowserLogin(options.user, callbackServer.redirectUri);
            const opened = await openBrowser(started.authorizationUrl);

            if (!opened) {
              writeStdout("If your browser did not open, navigate to this URL to authenticate:");
            }

            writeStdout(started.authorizationUrl);

            const callback = await callbackServer.waitForCallback();
            const completed = await apiClient.completeBrowserLogin({
              userId: options.user,
              code: callback.code,
              state: callback.state
            });
            await saveSession(sessionFilePath, {
              userId: options.user
            });
            writeStdout(`Connected as ${completed.profile.email}`);
          } finally {
            await callbackServer.close();
          }

          return;
        }

        const started = await apiClient.startDeviceLogin(options.user);
        writeStdout(`Open this URL in your browser: ${started.verificationUri}`);
        writeStdout(`Enter this code: ${started.userCode}`);

        for (;;) {
          const polled = await apiClient.pollDeviceLogin({
            userId: options.user,
            sessionId: started.sessionId
          });

          if (polled.status === "connected") {
            await saveSession(sessionFilePath, {
              userId: options.user
            });
            writeStdout(`Connected as ${polled.connection.profile.email}`);
            break;
          }

          await sleep(Math.max(started.intervalSeconds, 0) * 1000);
        }
      }
    );

  program.command("logout").action(async () => {
    const userId = await requireSessionUserId(sessionFilePath);
    await apiClient.logout(userId);
    await clearSession(sessionFilePath);
    writeStdout("Logged out");
  });

  program.command("whoami").action(async () => {
    const session = await loadSession(sessionFilePath);

    if (!session) {
      writeStdout("Not connected");
      return;
    }

    const connection = await apiClient.getConnection(session.userId);

    if (!connection) {
      writeStdout(`Session exists for ${session.userId}, but no server-side connection is linked.`);
      return;
    }

    writeStdout(`${connection.profile.name} <${connection.profile.email}>`);
  });

  const auth = program.command("auth");

  auth
    .command("status")
    .option("--user <userId>", "Local user identifier")
    .action(async (options: { user?: string }) => {
      const userId = options.user ?? (await requireSessionUserId(sessionFilePath));
      const status = await apiClient.getAuthStatus(userId);

      if (!status.connected || !status.profile) {
        writeStdout(`No active connection for ${userId}`);
        return;
      }

      writeStdout(`${status.profile.name} <${status.profile.email}>`);
    });

  program.command("doctor").action(async () => {
    const report = await apiClient.getDoctorReport();

    for (const check of report.checks) {
      writeStdout(`${check.id}: ${check.status} - ${check.summary}`);
    }

    writeStdout(`Doctor status: ${report.status}`);
  });

  program
    .command("providers")
    .command("list")
    .action(async () => {
      const providers = await apiClient.getProviders();

      for (const provider of providers) {
        writeStdout(`${provider.kind}: ${provider.status}`);
      }
    });

  program
    .command("capabilities")
    .command("list")
    .action(async () => {
      const capabilities = await apiClient.getCapabilities();

      for (const capability of capabilities) {
        writeStdout(
          `${capability.id}: ${capability.permissionLevel}${capability.category ? ` (${capability.category})` : ""}`
        );
      }
    });

  const project = program.command("project");

  project
    .command("init")
    .requiredOption("--name <name>", "Project name")
    .requiredOption("--base-url <baseUrl>", "Target base URL")
    .requiredOption("--project-root <projectRoot>", "Workspace root")
    .requiredOption("--source-root <sourceRoot>", "Source root to include")
    .action(
      async (options: {
        name: string;
        baseUrl: string;
        projectRoot: string;
        sourceRoot: string;
      }) => {
        const result = await apiClient.initProject({
          name: options.name,
          baseUrl: options.baseUrl,
          projectRoot: options.projectRoot,
          sourceRoots: [options.sourceRoot]
        });

        writeStdout(`Initialized ${result.project.name}`);
        writeStdout(result.configPath);
        writeStdout(result.policyPath);
      }
    );

  project.command("list").action(async () => {
    printJson(writeStdout, await apiClient.getProjects());
  });

  const policy = program.command("policy");

  policy
    .command("show")
    .requiredOption("--project-id <projectId>", "Project identifier")
    .action(async (options: { projectId: string }) => {
      printJson(writeStdout, await apiClient.getPolicy(options.projectId));
    });

  policy
    .command("enable-destructive")
    .requiredOption("--project-id <projectId>", "Project identifier")
    .option(
      "--allow-class <attackClass>",
      "Allow an exploit class in the project policy",
      (value: string, previous: string[]) => [...previous, value],
      [] as string[]
    )
    .action(async (options: { projectId: string; allowClass: string[] }) => {
      const existingPolicy = await apiClient.getPolicy(options.projectId);
      const allowedExploitClasses = Array.from(
        new Set([...existingPolicy.allowedExploitClasses, ...options.allowClass])
      );
      const updated = await apiClient.updatePolicy(options.projectId, {
        activeValidationAllowed: true,
        destructiveChecksEnabled: true,
        allowedExploitClasses
      });

      printJson(writeStdout, updated);
    });

  const runner = program.command("runner");

  runner.command("attach").action(async () => {
    const attached = await apiClient.attachRunner();
    writeStdout(`${attached.id}: ${attached.mode} (${attached.status})`);
  });

  const scan = program.command("scan");

  scan
    .command("run")
    .option("--target-id <targetId>", "Use an existing target identifier")
    .option("--project-id <projectId>", "Use an existing project identifier")
    .option("--name <name>", "Create a target inline before the scan")
    .option("--base-url <baseUrl>", "Target base URL")
    .option("--source-bundle <sourceBundlePath>", "Path to the source bundle")
    .option("--simulation", "Run in simulation verification mode")
    .action(
      async (options: {
        targetId?: string;
        projectId?: string;
        name?: string;
        baseUrl?: string;
        sourceBundle?: string;
        simulation?: boolean;
      }) => {
        const userId = await requireSessionUserId(sessionFilePath);
        let targetId = options.targetId;

        if (!targetId && !options.projectId) {
          if (!options.name || !options.baseUrl || !options.sourceBundle) {
            throw new Error(
              "Provide --project-id, --target-id, or all of --name, --base-url, and --source-bundle"
            );
          }

          const target = await apiClient.createTarget({
            name: options.name,
            baseUrl: options.baseUrl,
            sourceBundlePath: options.sourceBundle,
            verificationMode: options.simulation ? "simulation" : "passive"
          });
          targetId = target.id;
        }

        const run = await apiClient.runScan({
          userId,
          targetId,
          projectId: options.projectId
        });
        writeStdout(`Scan ${run.id} finished with status ${run.status}`);
      }
    );

  const report = program.command("report");

  report
    .command("export")
    .requiredOption("--scan-run-id <scanRunId>", "Scan run identifier")
    .option("--output <path>", "Write the JSON report to a file")
    .action(async (options: { scanRunId: string; output?: string }) => {
      const data = await apiClient.getReport(options.scanRunId);
      const json = JSON.stringify(data, null, 2);

      if (options.output) {
        await writeFile(options.output, json, "utf8");
        writeStdout(`Report written to ${options.output}`);
        return;
      }

      writeStdout(json);
    });

  try {
    await program.parseAsync(normalizeCliArgv(argv), {
      from: "node"
    });
    return 0;
  } catch (error) {
    writeStderr((error as Error).message);
    return 1;
  }
}
