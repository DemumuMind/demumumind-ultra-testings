import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "./run-cli.js";
import type {
  BrowserLoginResult,
  DeviceLoginPollResult,
  DeviceLoginStartResult,
  ShannonApiClient
} from "./api-client.js";

function createFakeApiClient() {
  const calls: string[] = [];
  const reports = new Map([
    [
      "scan-1",
      {
        report: {
          id: "report-1",
          scanRunId: "scan-1",
          findingIds: ["finding-1"]
        },
        findings: [
          {
            id: "finding-1",
            attackDomain: "injection"
          }
        ]
      }
    ]
  ]);
  let pollCount = 0;
  let browserRedirectUri: string | undefined;

  const apiClient: ShannonApiClient = {
    async startBrowserLogin(_userId, redirectUri): Promise<BrowserLoginResult> {
      calls.push("startBrowserLogin");
      browserRedirectUri = redirectUri;
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
    async startDeviceLogin(): Promise<DeviceLoginStartResult> {
      calls.push("startDeviceLogin");
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
    async createTarget(input) {
      calls.push(`createTarget:${input.name}`);
      return {
        id: "target-1",
        ...input
      };
    },
    async runScan(input) {
      calls.push(`runScan:${input.targetId}`);
      return {
        id: "scan-1",
        status: "completed",
        targetId: input.targetId
      };
    },
    async getReport(scanRunId) {
      calls.push(`getReport:${scanRunId}`);
      return reports.get(scanRunId) ?? {
        report: {
          id: "empty",
          scanRunId,
          findingIds: []
        },
        findings: []
      };
    },
    async getDoctorReport() {
      calls.push("getDoctorReport");
      return {
        status: "ready",
        checks: [
          {
            id: "windows-platform",
            status: "pass",
            summary: "Windows native runtime is supported"
          }
        ]
      };
    },
    async getProviders() {
      calls.push("getProviders");
      return [
        {
          kind: "openai",
          status: "configured"
        },
        {
          kind: "nvidia",
          status: "missing-key"
        }
      ];
    },
    async getCapabilities() {
      calls.push("getCapabilities");
      return [
        {
          id: "report-synthesis",
          permissionLevel: "safe"
        }
      ];
    },
    async initProject(input) {
      calls.push(`initProject:${input.name}`);
      return {
        project: {
          id: "project-1",
          name: input.name,
          proofMode: "safe"
        },
        configPath: "C:/demo/project/demumumind.config.yaml",
        policyPath: "C:/demo/project/policies/default.yaml"
      };
    },
    async getProjects() {
      calls.push("getProjects");
      return [
        {
          id: "project-1",
          name: "Demo project"
        }
      ];
    },
    async attachRunner() {
      calls.push("attachRunner");
      return {
        id: "runner-1",
        mode: "local",
        status: "ready"
      };
    }
  };

  return {
    apiClient,
    calls,
    getBrowserRedirectUri: () => browserRedirectUri
  };
}

describe("runCli", () => {
  test("completes device authorization and persists the local session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-cli-"));

    try {
      const { apiClient, calls } = createFakeApiClient();
      const output: string[] = [];

      const exitCode = await runCli(
        ["node", "cli", "login", "--device-auth", "--user", "local-user"],
        {
          apiClient,
          sessionFilePath: join(directory, "session.json"),
          writeStdout: (line) => output.push(line),
          writeStderr: (line) => output.push(line),
          sleep: async () => undefined
        }
      );

      expect(exitCode).toBe(0);
      expect(calls).toEqual([
        "startDeviceLogin",
        "pollDeviceLogin",
        "pollDeviceLogin"
      ]);
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

  test("completes browser authorization through a local callback server", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-cli-"));

    try {
      const { apiClient, calls, getBrowserRedirectUri } = createFakeApiClient();
      const output: string[] = [];
      const openedUrls: string[] = [];
      let closed = false;

      const exitCode = await runCli(["node", "cli", "login", "--user", "browser-user"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line),
        openBrowser: async (url) => {
          openedUrls.push(url);
          return true;
        },
        createBrowserCallbackServer: async () => ({
          redirectUri: "http://127.0.0.1:1455/auth/callback",
          async waitForCallback() {
            return {
              code: "browser-code",
              state: "state-1"
            };
          },
          async close() {
            closed = true;
          }
        })
      });

      expect(exitCode).toBe(0);
      expect(calls).toEqual(["startBrowserLogin", "completeBrowserLogin"]);
      expect(openedUrls).toEqual(["https://auth.example.test/authorize"]);
      expect(getBrowserRedirectUri()).toBe("http://127.0.0.1:1455/auth/callback");
      expect(output.join("\n")).toContain("Starting local login server");
      expect(output.join("\n")).toContain("Connected as browser@example.com");
      expect(closed).toBe(true);

      const session = JSON.parse(await readFile(join(directory, "session.json"), "utf8"));
      expect(session.userId).toBe("browser-user");
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  test("runs a scan and exports the resulting report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-cli-"));

    try {
      const { apiClient, calls } = createFakeApiClient();
      const output: string[] = [];
      const reportPath = join(directory, "report.json");

      const loginExit = await runCli(["node", "cli", "login", "--device-auth"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line),
        sleep: async () => undefined
      });

      expect(loginExit).toBe(0);

      const runExit = await runCli(
        [
          "node",
          "cli",
          "scan",
          "run",
          "--name",
          "Demo app",
          "--base-url",
          "http://localhost:3001",
          "--source-bundle",
          "C:/demo/source",
          "--simulation"
        ],
        {
          apiClient,
          sessionFilePath: join(directory, "session.json"),
          writeStdout: (line) => output.push(line),
          writeStderr: (line) => output.push(line),
          sleep: async () => undefined
        }
      );

      expect(runExit).toBe(0);

      const exportExit = await runCli(
        ["node", "cli", "report", "export", "--scan-run-id", "scan-1", "--output", reportPath],
        {
          apiClient,
          sessionFilePath: join(directory, "session.json"),
          writeStdout: (line) => output.push(line),
          writeStderr: (line) => output.push(line),
          sleep: async () => undefined
        }
      );

      expect(exportExit).toBe(0);
      expect(calls).toEqual(
        expect.arrayContaining([
          "createTarget:Demo app",
          "runScan:target-1",
          "getReport:scan-1"
        ])
      );
      expect(JSON.parse(await readFile(reportPath, "utf8")).findings[0].attackDomain).toBe(
        "injection"
      );
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  test("accepts slash commands for doctor, project bootstrap, providers, capabilities, and runners", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demumumind-cli-"));

    try {
      const { apiClient, calls } = createFakeApiClient();
      const output: string[] = [];

      const doctorExit = await runCli(["node", "cli", "/doctor"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line)
      });

      const projectExit = await runCli(
        [
          "node",
          "cli",
          "/project",
          "init",
          "--name",
          "Demo project",
          "--base-url",
          "http://localhost:3001",
          "--project-root",
          "C:/demo/project",
          "--source-root",
          "C:/demo/project/src"
        ],
        {
          apiClient,
          sessionFilePath: join(directory, "session.json"),
          writeStdout: (line) => output.push(line),
          writeStderr: (line) => output.push(line)
        }
      );

      const providersExit = await runCli(["node", "cli", "/providers"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line)
      });

      const capabilitiesExit = await runCli(["node", "cli", "/capabilities"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line)
      });

      const runnerExit = await runCli(["node", "cli", "/runner", "attach"], {
        apiClient,
        sessionFilePath: join(directory, "session.json"),
        writeStdout: (line) => output.push(line),
        writeStderr: (line) => output.push(line)
      });

      expect(doctorExit).toBe(0);
      expect(projectExit).toBe(0);
      expect(providersExit).toBe(0);
      expect(capabilitiesExit).toBe(0);
      expect(runnerExit).toBe(0);
      expect(calls).toEqual(
        expect.arrayContaining([
          "getDoctorReport",
          "initProject:Demo project",
          "getProviders",
          "getCapabilities",
          "attachRunner"
        ])
      );
      expect(output.join("\n")).toContain("windows-platform");
      expect(output.join("\n")).toContain("demumumind.config.yaml");
      expect(output.join("\n")).toContain("report-synthesis");
      expect(output.join("\n")).toContain("runner-1");
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});
