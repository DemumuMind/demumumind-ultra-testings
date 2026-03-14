import type { PipelineProgress, WorkflowDetail, WorkflowSummary } from "@shannon/shared";
import { shouldPollWorkflow } from "./workflow-progress.js";

function buildWorkflow(status: WorkflowSummary["status"]): WorkflowSummary {
  return {
    id: "workflow-1",
    scanRunId: "workflow-1",
    reportId: null,
    status,
    currentPhase: status === "running" ? "preflight" : "completed",
    targetUrl: "http://localhost:3001",
    repoPath: "C:/demo/repos/demo-app",
    workspace: "demo-workspace",
    reportPath: "C:/demo/audit-logs/demo-workspace/report.md",
    startedAt: "2026-03-13T10:00:00.000Z",
    endedAt: status === "running" ? null : "2026-03-13T11:00:00.000Z",
    durationMs: status === "running" ? 0 : 3600000,
    totalCostUsd: 0,
    totalTurns: 0,
    agentCount: 13,
    phaseHistory: [],
    agentBreakdown: []
  };
}

function buildDetail(status: WorkflowSummary["status"]): WorkflowDetail {
  return {
    workflow: buildWorkflow(status),
    report: {
      id: "report-1",
      scanRunId: "workflow-1",
      findingIds: [],
      generatedAt: "2026-03-13T11:00:00.000Z",
      exploitPacks: [],
      coverageMatrix: [],
      unsupportedClasses: []
    },
    findings: [],
    logs: []
  };
}

function buildProgress(status: PipelineProgress["status"]): PipelineProgress {
  return {
    workflowId: "workflow-1",
    status,
    currentPhase: status === "running" ? "preflight" : "completed",
    currentAgent: status === "running" ? "pre-recon" : null,
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: 0,
    elapsedMs: 0,
    agentMetrics: {},
    summary: null
  };
}

describe("shouldPollWorkflow", () => {
  test("polls when progress reports a running workflow", () => {
    expect(
      shouldPollWorkflow({
        workflowDetail: buildDetail("completed"),
        workflowSummary: buildWorkflow("completed"),
        workflowProgress: buildProgress("running")
      })
    ).toBe(true);
  });

  test("polls when workflow detail is still running", () => {
    expect(
      shouldPollWorkflow({
        workflowDetail: buildDetail("running"),
        workflowSummary: buildWorkflow("completed"),
        workflowProgress: null
      })
    ).toBe(true);
  });

  test("stops polling when all sources are settled", () => {
    expect(
      shouldPollWorkflow({
        workflowDetail: buildDetail("completed"),
        workflowSummary: buildWorkflow("completed"),
        workflowProgress: buildProgress("completed")
      })
    ).toBe(false);
  });
});
