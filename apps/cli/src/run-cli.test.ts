import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hostname } from "node:os";
import { CLI_QUICK_START_HELP, buildRuntimeBootstrapPlan, runCli } from "./run-cli.js";
import type {
  BrowserLoginResult,
  DeviceLoginPollResult,
  DeviceLoginStartResult,
  ShannonApiClient
} from "./api-client.js";

function createFakeApiClient() {
  const calls: string[] = [];
  let pollCount = 0;

  const workflowSummary = {
    id: "workflow-1",
    scanRunId: "scan-1",
    reportId: "report-1",
    status: "completed",
    currentPhase: "completed",
    targetUrl: "http://localhost:3001",
    repoPath: "C:/demo/repos/demo-app",
    workspace: "demo-workspace",
    reportPath: "./audit-logs/demo-workspace/report.json",
    startedAt: "2026-03-13T12:00:00.000Z",
    endedAt: "2026-03-13T12:01:30.000Z",
    durationMs: 90_000,
    totalCostUsd: 12.48,
    totalTurns: 311,
    agentCount: 5,
    phaseHistory: [
      {
        phase: "queued",
        changedAt: "2026-03-13T12:00:00.000Z"
      },
      {
        phase: "completed",
        changedAt: "2026-03-13T12:01:30.000Z"
      }
    ],
    agentBreakdown: [
      {
        id: "pre-recon",
        label: "pre-recon",
        status: "completed",
        durationMs: 12_000,
        turns: 41,
        costUsd: 1.95
      }
    ]
  };

  const apiClient: ShannonApiClient = {
    async startBrowserLogin(_userId, _provider, redirectUri): Promise<BrowserLoginResult> {
      calls.push(`startBrowserLogin:${redirectUri ?? "none"}`);
      return {
        sessionId: "browser-session-1",
        authorizationUrl: "https://auth.example.test/authorize",
        state: "state-1"
      };
    },
    async completeBrowserLogin() {
      calls.push("completeBrowserLogin");
      return {
        profile: {
          email: "browser@example.com",
          name: "Browser User"
        }
      };
    },
    async startDeviceLogin(_userId, provider): Promise<DeviceLoginStartResult> {
      calls.push(`startDeviceLogin:${provider}`);
      return {
        sessionId: "device-session-1",
        verificationUri: "https://auth.example.test/device",
        userCode: "ABCD-EFGH",
        intervalSeconds: 0
      };
    },
    async pollDeviceLogin(): Promise<DeviceLoginPollResult> {
      calls.push("pollDeviceLogin");
      pollCount += 1;

      if (pollCount === 1) {
        return {
          status: "pending"
        };
      }

      return {
        status: "connected",
        connection: {
          profile: {
            email: "device@example.com",
            name: "Device User"
          }
        }
      };
    },
    async logout() {
      calls.push("logout");
    },
    async getConnection(userId) {
      calls.push(`getConnection:${userId}`);
      return {
        profile: {
          email: "device@example.com",
          name: "Device User"
        }
      };
    },
    async getAuthStatus(userId) {
      calls.push(`getAuthStatus:${userId}`);
      return {
        connected: true,
        profile: {
          email: "device@example.com",
          name: "Device User"
        }
      };
    },
    async getProviders() {
      calls.push("getProviders");
      return [
        {
          kind: "openai",
          label: "OpenAI",
          status: "configured",
          authStrategies: ["browser-oauth", "device-auth", "manual"]
        },
        {
          kind: "nvidia",
          label: "NVIDIA",
          status: "missing-key",
          authStrategies: ["browser-oauth", "device-auth", "manual"]
        }
      ];
    },
    async startWorkflow(input) {
      calls.push(`startWorkflow:${input.url}:${input.repo}`);
      return workflowSummary;
    },
    async getWorkflow(workflowId) {
      calls.push(`getWorkflow:${workflowId}`);
      return {
        workflow: workflowSummary,
        report: {
          id: "report-1",
          scanRunId: workflowSummary.scanRunId,
          findingIds: ["finding-1"]
        },
        findings: [
          {
            id: "finding-1",
            attackDomain: "injection",
            title: "SQL injection sink exposed",
            proofOfImpact: "Confirmed read-only injection path",
            proofType: "safe"
          }
        ]
      };
    },
    async getWorkflowLogs(workflowId) {
      calls.push(`getWorkflowLogs:${workflowId}`);
      return {
        workflowId,
        logs: [
          "[2026-03-13 12:00:00] [workflow] Starting workflow",
          "[2026-03-13 12:01:30] [workflow] Workflow completed"
        ]
      };
    },
    async getWorkspaces() {
      calls.push("getWorkspaces");
      return [
        {
          id: "demo-workspace",
          name: "demo-workspace",
          status: "completed",
          workflowCount: 1,
          lastWorkflowId: "workflow-1",
          lastRunAt: "2026-03-13T12:01:30.000Z",
          targetUrl: "http://localhost:3001",
          repoPath: "C:/demo/repos/demo-app"
        }
      ];
    },
    async stopRuntime(input) {
      calls.push(`stopRuntime:${input.clean ? "clean" : "default"}`);
      return {
        status: "stopped",
        clean: input.clean ?? false,
        message: input.clean ? "Removed workflow data" : "Stopped local runtime"
      };
    }
  };

  return {
    apiClient,
    calls
  };
}

describe("runCli", () => {
  test("publishes Shannon-style quick start guidance", () => {
    expect(CLI_QUICK_START_HELP).toContain("git clone https://github.com/DemumuMind/demumumind-ultra-testings.git");
    expect(CLI_QUICK_START_HELP).toContain("./demumu start URL=https://example.com REPO=repo-name");
    expect(CLI_QUICK_START_HELP).toContain("./demumu logs ID=workflow-1234567890");
    expect(CLI_QUICK_START_HELP).toContain("./demumu query ID=workflow-1234567890");
  });

  test("prints the branded help screen when invoked without arguments", async () => {
    const { apiClient } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(["node", "cli"], {
      apiClient,
      writeStdout: (line) => output.push(line),
      writeStderr: (line) => output.push(line)
    });

    expect(exitCode).toBe(0);
    expect(output.join("\n")).toContain("SHANNON");
    expect(output.join("\n")).toContain("AI Penetration Testing Framework");
    expect(output.join("\n")).toContain("./demumu start URL=<url> REPO=<name>");
  });

  test("starts a workflow and prints the workflow summary", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(
      [
        "node",
        "cli",
        "start",
        "URL=http://localhost:3001",
        "REPO=demo-app",
        "WORKSPACE=demo-workspace"
      ],
      {
        apiClient,
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line)
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toContain("startWorkflow:http://localhost:3001:demo-app");
    expect(output.join("\n")).toContain("Workflow started: workflow-1");
    expect(output.join("\n")).toContain("Target:      http://localhost:3001");
    expect(output.join("\n")).toContain("Workspace:   demo-workspace");
    expect(output.join("\n")).toContain("./demumu logs ID=workflow-1");
    expect(output.join("\n")).toContain("./demumu query ID=workflow-1");
  });

  test("auto-starts the local daemon before starting a workflow when the API is unavailable", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];
    const runtimeCalls: string[] = [];
    let healthChecks = 0;

    const exitCode = await runCli(
      [
        "node",
        "cli",
        "start",
        "URL=http://localhost:3001",
        "REPO=demo-app"
      ],
      {
        apiClient,
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line),
        sleep: async () => undefined,
        checkRuntimeHealth: async () => {
          healthChecks += 1;
          runtimeCalls.push(`health:${healthChecks}`);
          return healthChecks >= 2;
        },
        startRuntime: async () => {
          runtimeCalls.push("startRuntime");
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(runtimeCalls).toEqual(["health:1", "startRuntime", "health:2"]);
    expect(calls).toContain("startWorkflow:http://localhost:3001:demo-app");
    expect(output.join("\n")).toContain("Daemon is unavailable. Starting it now...");
  });

  test("auto-starts the daemon for a custom local server url", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];
    const runtimeCalls: string[] = [];
    let healthChecks = 0;

    const exitCode = await runCli(
      ["node", "cli", "start", "URL=http://localhost:3001", "REPO=demo-app"],
      {
        apiClient,
        serverBaseUrl: `http://${hostname().toLowerCase()}:4100`,
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line),
        sleep: async () => undefined,
        checkRuntimeHealth: async () => {
          healthChecks += 1;
          runtimeCalls.push(`health:${healthChecks}`);
          return healthChecks >= 2;
        },
        startRuntime: async () => {
          runtimeCalls.push("startRuntime");
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(runtimeCalls).toEqual(["health:1", "startRuntime", "health:2"]);
    expect(calls).toContain("startWorkflow:http://localhost:3001:demo-app");
    expect(output.join("\n")).toContain("Daemon is unavailable. Starting it now...");
  });

  test("falls back to launching the server from source when the build output is missing", () => {
    const plan = buildRuntimeBootstrapPlan({
      serverBaseUrl: "http://127.0.0.1:4010",
      projectRoot: "C:/demo",
      distExists: false,
      sourceExists: true,
      tsxAvailable: true,
      forceLocal: true
    });

    expect(plan).toEqual({
      kind: "node-tsx",
      command: process.execPath,
      args: ["--import", "tsx", "C:\\demo\\apps\\server\\src\\index.ts"],
      cwd: "C:/demo",
      env: expect.objectContaining({
        HOST: "127.0.0.1",
        PORT: "4010"
      }),
      shell: false
    });
  });

  test("uses an explicit bootstrap command for custom daemon targets", () => {
    const plan = buildRuntimeBootstrapPlan({
      serverBaseUrl: "https://shannon.internal",
      projectRoot: "C:/demo",
      bootstrapCommand: "docker compose up shannon-server",
      forceLocal: false
    });

    expect(plan).toEqual({
      kind: "custom-command",
      command: "docker compose up shannon-server",
      args: [],
      cwd: "C:/demo",
      env: expect.objectContaining({
        DEMUMUMIND_SERVER_URL: "https://shannon.internal",
        SHANNON_SERVER_URL: "https://shannon.internal",
        HOST: "shannon.internal",
        PORT: "443"
      }),
      shell: true
    });
  });

  test("queries workflow details and pretty-prints the result", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(["node", "cli", "query", "ID=workflow-1"], {
      apiClient,
      writeStdout: (line) => output.push(line),
      writeStderr: (line) => output.push(line)
    });

    expect(exitCode).toBe(0);
    expect(calls).toContain("getWorkflow:workflow-1");
    expect(output.join("\n")).toContain('"id": "workflow-1"');
    expect(output.join("\n")).toContain('"totalCostUsd": 12.48');
    expect(output.join("\n")).toContain('"agentCount": 5');
  });

  test("prints workflow logs", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(["node", "cli", "logs", "ID=workflow-1"], {
      apiClient,
      writeStdout: (line) => output.push(line),
      writeStderr: (line) => output.push(line)
    });

    expect(exitCode).toBe(0);
    expect(calls).toContain("getWorkflowLogs:workflow-1");
    expect(output.join("\n")).toContain("Starting workflow");
    expect(output.join("\n")).toContain("Workflow completed");
  });

  test("lists workspaces", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(["node", "cli", "workspaces"], {
      apiClient,
      writeStdout: (line) => output.push(line),
      writeStderr: (line) => output.push(line)
    });

    expect(exitCode).toBe(0);
    expect(calls).toContain("getWorkspaces");
    expect(output.join("\n")).toContain("demo-workspace");
    expect(output.join("\n")).toContain("workflow-1");
  });

  test("stops the runtime and supports clean shutdown", async () => {
    const { apiClient, calls } = createFakeApiClient();
    const output: string[] = [];

    const exitCode = await runCli(["node", "cli", "stop", "CLEAN=true"], {
      apiClient,
      writeStdout: (line) => output.push(line),
      writeStderr: (line) => output.push(line)
    });

    expect(exitCode).toBe(0);
    expect(calls).toContain("stopRuntime:clean");
    expect(output.join("\n")).toContain("Removed workflow data");
  });

  test("completes device authorization and persists the local session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-cli-"));

    try {
      const { apiClient, calls } = createFakeApiClient();
      const output: string[] = [];

      const exitCode = await runCli(
        ["node", "cli", "login", "--device-auth", "--provider", "openai", "--user", "local-user"],
        {
          apiClient,
          sessionFilePath: join(directory, "session.json"),
          writeStdout: (line) => output.push(line),
          writeStderr: (line) => output.push(line),
          sleep: async () => undefined
        }
      );

      expect(exitCode).toBe(0);
      expect(calls).toEqual(expect.arrayContaining(["startDeviceLogin:openai", "pollDeviceLogin"]));
      expect(output.join("\n")).toContain("ABCD-EFGH");

      const session = JSON.parse(await readFile(join(directory, "session.json"), "utf8"));
      expect(session.userId).toBe("local-user");
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
