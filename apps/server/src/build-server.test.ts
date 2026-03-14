import {
  CcsCodexService,
  InMemoryStateRepository
} from "@shannon/core";
import type { WorkflowRuntimeClient } from "@shannon/worker";
import { buildServer } from "./build-server.js";
import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";
import type { PipelineProgress } from "@shannon/shared";
import type { WorkspaceArtifactPreview, WorkspaceDetail } from "@shannon/shared";

class FakeWorkflowRuntimeClient implements WorkflowRuntimeClient {
  public readonly summary: WorkflowSummary = {
    id: "workflow-1",
    scanRunId: "workflow-1",
    reportId: "workflow-1-report",
    status: "running",
    currentPhase: "preflight",
    targetUrl: "http://localhost:3001",
    repoPath: "C:/demo/repos/demo-app",
    workspace: "demo-workspace",
    reportPath:
      "C:/demo/audit-logs/demo-workspace/comprehensive_security_assessment_report.md",
    startedAt: "2026-03-13T10:00:00.000Z",
    endedAt: null,
    durationMs: 0,
    totalCostUsd: 0,
    totalTurns: 0,
    agentCount: 13,
    phaseHistory: [
      {
        phase: "preflight",
        changedAt: "2026-03-13T10:00:00.000Z"
      }
    ],
    agentBreakdown: []
  };

  public readonly detail: WorkflowDetail = {
    workflow: this.summary,
    report: {
      id: "workflow-1-report",
      scanRunId: "workflow-1",
      findingIds: [],
      generatedAt: "2026-03-13T10:00:00.000Z",
      exploitPacks: [],
      coverageMatrix: [],
      unsupportedClasses: []
    },
    findings: [],
    logs: [
      "[2026-03-13T10:00:00.000Z] [workflow] Initialized workflow-1",
      "[2026-03-13T10:00:05.000Z] [phase] START preflight"
    ]
  };

  public readonly workspaces: WorkspaceSummary[] = [
    {
      id: "demo-workspace",
      name: "demo-workspace",
      status: "running",
      workflowCount: 1,
      lastWorkflowId: "workflow-1",
      lastRunAt: "2026-03-13T10:00:00.000Z",
      targetUrl: "http://localhost:3001",
      repoPath: "C:/demo/repos/demo-app"
    }
  ];
  public readonly progress: PipelineProgress = {
    workflowId: "workflow-1",
    status: "running",
    currentPhase: "preflight",
    currentAgent: "pre-recon",
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: new Date("2026-03-13T10:00:00.000Z").getTime(),
    elapsedMs: 5000,
    agentMetrics: {},
    summary: null
  };
  public readonly workspaceDetail: WorkspaceDetail = {
    workspace: {
      id: "demo-workspace",
      name: "demo-workspace",
      status: "running",
      workflowCount: 1,
      lastWorkflowId: "workflow-1",
      lastRunAt: "2026-03-13T10:00:00.000Z",
      targetUrl: "http://localhost:3001",
      repoPath: "C:/demo/repos/demo-app"
    },
    workflowIds: ["workflow-1"],
    resumeAttempts: [],
    artifacts: [
      {
        kind: "session",
        label: "Session Metadata",
        path: "C:/demo/audit-logs/demo-workspace/session.json",
        exists: true
      }
    ]
  };
  public readonly artifactPreview: WorkspaceArtifactPreview = {
    artifact: {
      kind: "session",
      label: "Session Metadata",
      path: "C:/demo/audit-logs/demo-workspace/session.json",
      exists: true
    },
    contentType: "application/json",
    content: '{\n  "session": {\n    "id": "demo-workspace"\n  }\n}',
    truncated: false
  };

  public stopRequests: Array<{ clean?: boolean }> = [];
  public stopWorkflowRequests: string[] = [];

  async startWorkflow(_input: {
    userId: string;
    url: string;
    repo: string;
    config?: string;
    output?: string;
    workspace?: string;
    wait?: boolean;
    pipelineTestingMode?: boolean;
  }): Promise<WorkflowSummary> {
    return this.summary;
  }

  async getWorkflows(): Promise<WorkflowSummary[]> {
    return [this.summary];
  }

  async getWorkflow(_workflowId: string): Promise<WorkflowDetail> {
    return this.detail;
  }

  async getWorkflowProgress(_workflowId: string): Promise<PipelineProgress> {
    return this.progress;
  }

  async getWorkflowLogs(_workflowId: string): Promise<{ workflowId: string; logs: string[] }> {
    return {
      workflowId: this.summary.id,
      logs: this.detail.logs
    };
  }

  async getWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.workspaces;
  }

  async getWorkspace(_workspaceId: string): Promise<WorkspaceDetail> {
    return this.workspaceDetail;
  }

  async getWorkspaceArtifact(
    _workspaceId: string,
    _artifactKind: "session" | "workflow-summary" | "workflow-log" | "report-json" | "final-report"
  ): Promise<WorkspaceArtifactPreview> {
    return this.artifactPreview;
  }

  async stopWorkflow(workflowId: string): Promise<WorkflowSummary> {
    this.stopWorkflowRequests.push(workflowId);
    return {
      ...this.summary,
      status: "stopped",
      endedAt: "2026-03-13T10:05:00.000Z"
    };
  }

  async stopRuntime(input: { clean?: boolean }): Promise<{
    status: "stopped";
    clean: boolean;
    message: string;
  }> {
    this.stopRequests.push(input);
    return {
      status: "stopped",
      clean: input.clean ?? false,
      message: input.clean ? "Removed workflow data" : "Stopped local runtime"
    };
  }

  async checkRuntimeHealth(): Promise<boolean> {
    return true;
  }
}

function createFakeCcsService() {
  const calls: string[] = [];
  const status = {
    binaryReady: true,
    settingsPath: "C:/Users/demo/.ccs/codex.settings.json",
    profileConfigured: true,
    dashboardUrl: "http://localhost:3000",
    dashboardRunning: true,
    cliProxyRunning: true,
    callbackPort: 1455,
    callbackPortReady: true,
    localhostBindable: true,
    firewallStatus: "warn" as const,
    recentLogs: ["[OK] Browser opened"],
    recommendedFixes: [
      'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455'
    ],
    activeProcess: "idle" as const
  };

  return {
    calls,
    service: {
      async getStatus() {
        calls.push("getStatus");
        return status;
      },
      async startOpenAiConnect() {
        calls.push("startOpenAiConnect");
        return {
          ...status,
          activeProcess: "running" as const
        };
      },
      async startDashboard() {
        calls.push("startDashboard");
        return {
          ...status,
          activeProcess: "running" as const
        };
      },
      async stopDashboard() {
        calls.push("stopDashboard");
        return {
          ...status,
          dashboardRunning: false,
          cliProxyRunning: false,
          activeProcess: "idle" as const
        };
      }
    } satisfies Pick<
      CcsCodexService,
      "getStatus" | "startOpenAiConnect" | "startDashboard" | "stopDashboard"
    >
  };
}

function createServer(
  workflowClient: WorkflowRuntimeClient = new FakeWorkflowRuntimeClient(),
  ccsService: Pick<
    CcsCodexService,
    "getStatus" | "startOpenAiConnect" | "startDashboard" | "stopDashboard"
  > = createFakeCcsService().service
) {
  const stateRepository = new InMemoryStateRepository();
  return buildServer({
    stateRepository,
    ccsService,
    workflowClient
  });
}

describe("buildServer", () => {
  test("keeps only OpenAI and NVIDIA providers and advertises CCS for OpenAI", async () => {
    const server = createServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/providers"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          kind: "openai",
          authStrategies: ["ccs-codex", "manual"]
        }),
        expect.objectContaining({
          kind: "nvidia",
          authStrategies: ["manual"]
        })
      ]);
    } finally {
      await server.close();
    }
  });

  test("exposes CCS status and launch endpoints for OpenAI and dashboard control", async () => {
    const { service, calls } = createFakeCcsService();
    const server = createServer(new FakeWorkflowRuntimeClient(), service);

    try {
      const status = await server.inject({
        method: "GET",
        url: "/api/integrations/ccs/status"
      });
      expect(status.statusCode).toBe(200);
      expect(status.json()).toEqual(
        expect.objectContaining({
          profileConfigured: true,
          dashboardRunning: true,
          cliProxyRunning: true
        })
      );

      const connect = await server.inject({
        method: "POST",
        url: "/api/integrations/ccs/openai/connect"
      });
      expect(connect.statusCode).toBe(200);
      expect(connect.json().activeProcess).toBe("running");

      const startDashboard = await server.inject({
        method: "POST",
        url: "/api/integrations/ccs/dashboard/start"
      });
      expect(startDashboard.statusCode).toBe(200);

      const stopDashboard = await server.inject({
        method: "POST",
        url: "/api/integrations/ccs/dashboard/stop"
      });
      expect(stopDashboard.statusCode).toBe(200);
      expect(stopDashboard.json().dashboardRunning).toBe(false);

      expect(calls).toEqual(
        expect.arrayContaining([
          "getStatus",
          "startOpenAiConnect",
          "startDashboard",
          "stopDashboard"
        ])
      );
    } finally {
      await server.close();
    }
  });

  test("starts a workflow and exposes dashboard-ready workflow, logs, and workspace data", async () => {
    const workflowClient = new FakeWorkflowRuntimeClient();
    const server = createServer(workflowClient);

    try {
      const started = await server.inject({
        method: "POST",
        url: "/api/workflows/start",
        payload: {
          userId: "user-1",
          url: "http://localhost:3001",
          repo: "demo-app",
          workspace: "demo-workspace",
          output: "C:/demo/audit-logs"
        }
      });

      expect(started.statusCode).toBe(201);
      expect(started.json()).toEqual(
        expect.objectContaining({
          id: "workflow-1",
          status: "running",
          targetUrl: "http://localhost:3001",
          workspace: "demo-workspace",
          repoPath: "C:/demo/repos/demo-app",
          currentPhase: "preflight",
          reportPath: expect.stringContaining("comprehensive_security_assessment_report.md")
        })
      );

      const workflows = await server.inject({
        method: "GET",
        url: "/api/workflows"
      });
      expect(workflows.statusCode).toBe(200);
      expect(workflows.json()).toEqual([expect.objectContaining({ id: "workflow-1" })]);

      const detail = await server.inject({
        method: "GET",
        url: `/api/workflows/${started.json().id}`
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().workflow.id).toBe(started.json().id);
      expect(detail.json().workflow.currentPhase).toBe("preflight");
      expect(detail.json().findings).toEqual([]);

      const progress = await server.inject({
        method: "GET",
        url: `/api/workflows/${started.json().id}/progress`
      });
      expect(progress.statusCode).toBe(200);
      expect(progress.json()).toEqual(
        expect.objectContaining({
          workflowId: "workflow-1",
          currentPhase: "preflight",
          currentAgent: "pre-recon"
        })
      );

      const logs = await server.inject({
        method: "GET",
        url: `/api/workflows/${started.json().id}/logs`
      });
      expect(logs.statusCode).toBe(200);
      expect(logs.json().logs[0]).toContain("Initialized workflow-1");

      const workspaces = await server.inject({
        method: "GET",
        url: "/api/workspaces"
      });
      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json()).toEqual([
          expect.objectContaining({
            name: "demo-workspace",
            lastWorkflowId: started.json().id,
            workflowCount: 1,
            targetUrl: "http://localhost:3001"
          })
        ]);
    } finally {
      await server.close();
    }
  });

  test("stops the local runtime and supports clean data removal", async () => {
    const workflowClient = new FakeWorkflowRuntimeClient();
    const server = createServer(workflowClient);

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/runtime/stop",
        payload: {
          clean: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "stopped",
        clean: true,
        message: "Removed workflow data"
      });
      expect(workflowClient.stopRequests).toEqual([{ clean: true }]);
    } finally {
      await server.close();
    }
  });

  test("exposes runtime health and rejects legacy scan and broker auth endpoints", async () => {
    const server = createServer();

    try {
      const health = await server.inject({
        method: "GET",
        url: "/api/runtime/health"
      });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({
        healthy: true,
        mode: "temporal"
      });

      const scanStart = await server.inject({
        method: "POST",
        url: "/api/scans",
        payload: {
          userId: "user-1",
          targetId: "target-1"
        }
      });
      expect(scanStart.statusCode).toBe(410);
      expect(scanStart.json().error).toContain("/api/workflows/start");

      const legacyAuth = await server.inject({
        method: "POST",
        url: "/api/auth/device/start",
        payload: {
          userId: "user-1"
        }
      });
      expect(legacyAuth.statusCode).toBe(410);
      expect(legacyAuth.json().error).toContain("/api/integrations/ccs");
    } finally {
      await server.close();
    }
  });

  test("stops a specific workflow through the runtime client", async () => {
    const workflowClient = new FakeWorkflowRuntimeClient();
    const server = createServer(workflowClient);

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/workflows/workflow-1/stop"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          id: "workflow-1",
          status: "stopped"
        })
      );
      expect(workflowClient.stopWorkflowRequests).toEqual(["workflow-1"]);
    } finally {
      await server.close();
    }
  });

  test("returns workspace detail with artifact navigation data", async () => {
    const server = createServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/workspaces/demo-workspace"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(
        expect.objectContaining({
          workspace: expect.objectContaining({
            id: "demo-workspace"
          }),
          workflowIds: ["workflow-1"],
          artifacts: [expect.objectContaining({ kind: "session" })]
        })
      );
    } finally {
      await server.close();
    }
  });

  test("returns preview and download data for workspace artifacts", async () => {
    const server = createServer();

    try {
      const preview = await server.inject({
        method: "GET",
        url: "/api/workspaces/demo-workspace/artifacts/session/preview"
      });

      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toEqual(
        expect.objectContaining({
          artifact: expect.objectContaining({
            kind: "session"
          }),
          contentType: "application/json",
          truncated: false
        })
      );

      const download = await server.inject({
        method: "GET",
        url: "/api/workspaces/demo-workspace/artifacts/session/download"
      });

      expect(download.statusCode).toBe(200);
      expect(download.headers["content-type"]).toContain("application/json");
      expect(download.headers["content-disposition"]).toContain("session.json");
      expect(download.body).toContain("\"demo-workspace\"");
    } finally {
      await server.close();
    }
  });
});
