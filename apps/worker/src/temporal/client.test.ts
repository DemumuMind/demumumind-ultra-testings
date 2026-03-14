import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildPipelineInput,
  TemporalPipelineClient,
  listWorkflowSummaries,
  listWorkspaceSummaries,
  resolveWorkspaceSession
} from "./client.js";

describe("temporal client helpers", () => {
  test("creates a new workspace session for a fresh target", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      const resolved = await resolveWorkspaceSession({
        auditRoot,
        webUrl: "https://demo.test/login",
        repoPath: "C:/demo/repos/demo-app",
        now: () => 1_710_000_000_000
      });

      expect(resolved).toEqual({
        workflowId: "demo-test_shannon-1710000000000",
        sessionId: "demo-test",
        isResume: false,
        terminatedWorkflows: []
      });

      const input = buildPipelineInput(
        {
          webUrl: "https://demo.test/login",
          repoPath: "C:/demo/repos/demo-app",
          configPath: "./configs/example-config.yaml",
          outputPath: "./audit-logs",
          waitForCompletion: false,
          pipelineTestingMode: true
        },
        resolved,
        {
          retryPreset: "testing",
          maxConcurrentPipelines: 3
        }
      );

      expect(input).toEqual(
        expect.objectContaining({
          workflowId: "demo-test_shannon-1710000000000",
          sessionId: "demo-test",
          pipelineTestingMode: true,
          pipelineConfig: {
            retryPreset: "testing",
            maxConcurrentPipelines: 3
          }
        })
      );
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("uses resume workflow ids when a workspace already exists", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "saved-workspace"), {
        recursive: true
      });
      await writeFile(
        join(auditRoot, "saved-workspace", "session.json"),
        JSON.stringify({
          session: {
            id: "saved-workspace",
            webUrl: "https://demo.test/login",
            repoPath: "C:/demo/repos/demo-app",
            originalWorkflowId: "workflow-1"
          },
          status: "failed"
        }),
        "utf8"
      );

      const resolved = await resolveWorkspaceSession({
        auditRoot,
        webUrl: "https://demo.test/login",
        repoPath: "C:/demo/repos/demo-app",
        requestedWorkspace: "saved-workspace",
        now: () => 1_710_000_000_999
      });

      expect(resolved).toEqual({
        workflowId: "saved-workspace_resume_1710000000999",
        sessionId: "saved-workspace",
        isResume: true,
        terminatedWorkflows: []
      });
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("lists workspace summaries from audit artifacts", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "first"), { recursive: true });
      await mkdir(join(auditRoot, "second"), { recursive: true });

      await writeFile(
        join(auditRoot, "first", "session.json"),
        JSON.stringify({
          session: {
            id: "first",
            webUrl: "https://first.test",
            repoPath: "C:/demo/repos/first",
            originalWorkflowId: "workflow-1"
          },
          status: "completed",
          workflowCount: 1,
          lastRunAt: "2026-03-13T11:00:00.000Z"
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "second", "session.json"),
        JSON.stringify({
          session: {
            id: "second",
            webUrl: "https://second.test",
            repoPath: "C:/demo/repos/second",
            originalWorkflowId: "workflow-2"
          },
          status: "running",
          workflowCount: 2,
          lastRunAt: "2026-03-13T12:00:00.000Z"
        }),
        "utf8"
      );

      const workspaces = await listWorkspaceSummaries(auditRoot);

      expect(workspaces.map((workspace) => workspace.id)).toEqual(["second", "first"]);
      expect(workspaces[0]).toEqual(
        expect.objectContaining({
          workflowCount: 2,
          lastWorkflowId: "workflow-2",
          status: "running"
        })
      );
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("lists workflow summaries from workspace artifacts", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "first"), { recursive: true });
      await mkdir(join(auditRoot, "second"), { recursive: true });

      await writeFile(
        join(auditRoot, "first", "workflow.json"),
        JSON.stringify({
          id: "workflow-1",
          scanRunId: "workflow-1",
          reportId: null,
          status: "completed",
          currentPhase: "completed",
          targetUrl: "https://first.test",
          repoPath: "C:/demo/repos/first",
          workspace: "first",
          reportPath: "C:/demo/audit-logs/first/report.md",
          startedAt: "2026-03-13T11:00:00.000Z",
          endedAt: "2026-03-13T11:10:00.000Z",
          durationMs: 600000,
          totalCostUsd: 10,
          totalTurns: 100,
          agentCount: 1,
          phaseHistory: [],
          agentBreakdown: []
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "second", "workflow.json"),
        JSON.stringify({
          id: "workflow-2",
          scanRunId: "workflow-2",
          reportId: null,
          status: "running",
          currentPhase: "preflight",
          targetUrl: "https://second.test",
          repoPath: "C:/demo/repos/second",
          workspace: "second",
          reportPath: "C:/demo/audit-logs/second/report.md",
          startedAt: "2026-03-13T12:00:00.000Z",
          endedAt: null,
          durationMs: 0,
          totalCostUsd: 0,
          totalTurns: 0,
          agentCount: 0,
          phaseHistory: [],
          agentBreakdown: []
        }),
        "utf8"
      );

      const workflows = await listWorkflowSummaries(auditRoot);

      expect(workflows.map((workflow) => workflow.id)).toEqual(["workflow-2", "workflow-1"]);
      expect(workflows[0]).toEqual(
        expect.objectContaining({
          currentPhase: "preflight",
          workspace: "second"
        })
      );
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("builds workflow progress from persisted workflow data when Temporal is unavailable", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "saved"), { recursive: true });
      await writeFile(
        join(auditRoot, "saved", "session.json"),
        JSON.stringify({
          session: {
            id: "saved",
            webUrl: "https://saved.test",
            repoPath: "C:/demo/repos/saved",
            originalWorkflowId: "workflow-1",
            lastWorkflowId: "workflow-1",
            workflowIds: ["workflow-1"],
            resumeAttempts: []
          },
          status: "completed",
          workflowCount: 1,
          lastRunAt: "2026-03-13T12:00:00.000Z",
          reportPath: "C:/demo/audit-logs/saved/report.md",
          metrics: {
            agents: {}
          }
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "saved", "workflow.json"),
        JSON.stringify({
          id: "workflow-1",
          scanRunId: "workflow-1",
          reportId: null,
          status: "completed",
          currentPhase: "completed",
          targetUrl: "https://saved.test",
          repoPath: "C:/demo/repos/saved",
          workspace: "saved",
          reportPath: "C:/demo/audit-logs/saved/report.md",
          startedAt: "2026-03-13T11:00:00.000Z",
          endedAt: "2026-03-13T12:00:00.000Z",
          durationMs: 3600000,
          totalCostUsd: 3.5,
          totalTurns: 45,
          agentCount: 13,
          phaseHistory: [],
          agentBreakdown: []
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "saved", "report.json"),
        JSON.stringify({
          id: "report-1",
          scanRunId: "workflow-1",
          findingIds: [],
          generatedAt: "2026-03-13T12:00:00.000Z",
          exploitPacks: [],
          coverageMatrix: [],
          unsupportedClasses: []
        }),
        "utf8"
      );

      const client = new TemporalPipelineClient({
        auditRoot,
        address: "127.0.0.1:1"
      });
      (client as unknown as { readProgress: () => Promise<never> }).readProgress = async () => {
        throw new Error("Temporal unavailable");
      };

      const progress = await client.getWorkflowProgress("workflow-1");

      expect(progress).toEqual(
        expect.objectContaining({
          workflowId: "workflow-1",
          status: "completed",
          currentPhase: "completed",
          elapsedMs: 3600000,
          summary: expect.objectContaining({
            totalCostUsd: 3.5,
            totalTurns: 45,
            agentCount: 13
          })
        })
      );
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("stops a workflow and persists stopped status to workspace artifacts", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "saved"), { recursive: true });
      await writeFile(
        join(auditRoot, "saved", "session.json"),
        JSON.stringify({
          session: {
            id: "saved",
            webUrl: "https://saved.test",
            repoPath: "C:/demo/repos/saved",
            originalWorkflowId: "workflow-1",
            lastWorkflowId: "workflow-1",
            workflowIds: ["workflow-1"],
            resumeAttempts: []
          },
          status: "running",
          workflowCount: 1,
          lastRunAt: "2026-03-13T12:00:00.000Z",
          reportPath: "C:/demo/audit-logs/saved/report.md",
          metrics: {
            agents: {}
          }
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "saved", "workflow.json"),
        JSON.stringify({
          id: "workflow-1",
          scanRunId: "workflow-1",
          reportId: null,
          status: "running",
          currentPhase: "preflight",
          targetUrl: "https://saved.test",
          repoPath: "C:/demo/repos/saved",
          workspace: "saved",
          reportPath: "C:/demo/audit-logs/saved/report.md",
          startedAt: "2026-03-13T11:00:00.000Z",
          endedAt: null,
          durationMs: 0,
          totalCostUsd: 0,
          totalTurns: 0,
          agentCount: 13,
          phaseHistory: [],
          agentBreakdown: []
        }),
        "utf8"
      );
      await writeFile(join(auditRoot, "saved", "workflow.log"), "", "utf8");

      const client = new TemporalPipelineClient({
        auditRoot,
        address: "127.0.0.1:1"
      });
      (client as unknown as { terminateWorkflow: () => Promise<void> }).terminateWorkflow = async () => {};

      const stopped = await client.stopWorkflow("workflow-1");

      expect(stopped.status).toBe("stopped");
      expect(stopped.endedAt).not.toBeNull();

      const persistedWorkflow = JSON.parse(
        await readFile(join(auditRoot, "saved", "workflow.json"), "utf8")
      );
      const persistedSession = JSON.parse(
        await readFile(join(auditRoot, "saved", "session.json"), "utf8")
      );
      const logs = await readFile(join(auditRoot, "saved", "workflow.log"), "utf8");

      expect(persistedWorkflow.status).toBe("stopped");
      expect(persistedSession.status).toBe("stopped");
      expect(logs).toContain("STOPPED workflow-1");
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("reads workspace detail with artifact paths and resume attempts", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "saved"), { recursive: true });
      await writeFile(
        join(auditRoot, "saved", "session.json"),
        JSON.stringify({
          session: {
            id: "saved",
            webUrl: "https://saved.test",
            repoPath: "C:/demo/repos/saved",
            originalWorkflowId: "workflow-1",
            lastWorkflowId: "workflow-2",
            workflowIds: ["workflow-1", "workflow-2"],
            resumeAttempts: [
              {
                workflowId: "workflow-2",
                supersededWorkflowIds: ["workflow-1"],
                checkpointHash: "abc123"
              }
            ]
          },
          status: "running",
          workflowCount: 2,
          lastRunAt: "2026-03-13T12:00:00.000Z",
          reportPath: "C:/demo/audit-logs/saved/comprehensive_security_assessment_report.md",
          metrics: {
            agents: {}
          }
        }),
        "utf8"
      );
      await writeFile(
        join(auditRoot, "saved", "workflow.json"),
        JSON.stringify({
          id: "workflow-2",
          scanRunId: "workflow-2",
          reportId: null,
          status: "running",
          currentPhase: "preflight",
          targetUrl: "https://saved.test",
          repoPath: "C:/demo/repos/saved",
          workspace: "saved",
          reportPath: "C:/demo/audit-logs/saved/comprehensive_security_assessment_report.md",
          startedAt: "2026-03-13T11:00:00.000Z",
          endedAt: null,
          durationMs: 0,
          totalCostUsd: 0,
          totalTurns: 0,
          agentCount: 13,
          phaseHistory: [],
          agentBreakdown: []
        }),
        "utf8"
      );
      await writeFile(join(auditRoot, "saved", "workflow.log"), "", "utf8");
      await writeFile(join(auditRoot, "saved", "report.json"), "{}", "utf8");

      const client = new TemporalPipelineClient({
        auditRoot,
        address: "127.0.0.1:1"
      });

      const detail = await client.getWorkspace("saved");

      expect(detail.workspace).toEqual(
        expect.objectContaining({
          id: "saved",
          workflowCount: 2,
          lastWorkflowId: "workflow-2"
        })
      );
      expect(detail.workflowIds).toEqual(["workflow-1", "workflow-2"]);
      expect(detail.resumeAttempts).toEqual([
        expect.objectContaining({
          workflowId: "workflow-2",
          checkpointHash: "abc123"
        })
      ]);
      expect(detail.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "session", exists: true }),
          expect.objectContaining({ kind: "workflow-log", exists: true }),
          expect.objectContaining({ kind: "report-json", exists: true }),
          expect.objectContaining({ kind: "final-report", exists: false })
        ])
      );
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("reads workspace artifact preview content for inline inspection", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-client-"));

    try {
      await mkdir(join(auditRoot, "saved"), { recursive: true });
      await writeFile(
        join(auditRoot, "saved", "session.json"),
        JSON.stringify({
          session: {
            id: "saved",
            webUrl: "https://saved.test",
            repoPath: "C:/demo/repos/saved",
            originalWorkflowId: "workflow-1",
            workflowIds: ["workflow-1"],
            resumeAttempts: []
          },
          status: "running",
          workflowCount: 1,
          lastRunAt: "2026-03-13T12:00:00.000Z"
        }),
        "utf8"
      );

      const client = new TemporalPipelineClient({
        auditRoot,
        address: "127.0.0.1:1"
      });

      const preview = await client.getWorkspaceArtifact("saved", "session");

      expect(preview).toEqual(
        expect.objectContaining({
          artifact: expect.objectContaining({
            kind: "session",
            exists: true
          }),
          contentType: "application/json",
          truncated: false
        })
      );
      expect(preview.content).toContain("\"id\": \"saved\"");
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });
});
