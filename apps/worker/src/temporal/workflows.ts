import { defineQuery, proxyActivities, setHandler, workflowInfo } from "@temporalio/workflow";
import type { PipelineInput, PipelineState, WorkflowSummary } from "@shannon/shared";

import type * as activities from "./activities.js";
import { buildProgress } from "./shared.js";

const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes"
});
const progressQuery = defineQuery("getProgress");

export async function pentestPipelineWorkflow(input: PipelineInput): Promise<PipelineState> {
  const { workflowId } = workflowInfo();
  const state: PipelineState = {
    status: "running",
    currentPhase: "preflight",
    currentAgent: null,
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: Date.now(),
    agentMetrics: {},
    summary: null
  };

  setHandler(progressQuery, () => buildProgress(workflowId, state));

  try {
    await acts.runPreflightValidation(input);

    state.currentPhase = "pre-recon";
    state.currentAgent = "pre-recon";
    state.agentMetrics["pre-recon"] = await acts.runPreReconAgent(input);
    state.completedAgents.push("pre-recon");

    state.currentPhase = "recon";
    state.currentAgent = "recon";
    state.agentMetrics.recon = await acts.runReconAgent(input);
    state.completedAgents.push("recon");

    state.currentPhase = "vulnerability-exploitation";
    state.currentAgent = "pipelines";

    const pipelineSteps = [
      ["injection-vuln", acts.runInjectionVulnAgent, "injection", "injection-exploit", acts.runInjectionExploitAgent],
      ["xss-vuln", acts.runXssVulnAgent, "xss", "xss-exploit", acts.runXssExploitAgent],
      ["auth-vuln", acts.runAuthVulnAgent, "auth", "auth-exploit", acts.runAuthExploitAgent],
      ["ssrf-vuln", acts.runSsrfVulnAgent, "ssrf", "ssrf-exploit", acts.runSsrfExploitAgent],
      ["authz-vuln", acts.runAuthzVulnAgent, "authz", "authz-exploit", acts.runAuthzExploitAgent]
    ] as const;

    await Promise.all(
      pipelineSteps.map(async ([vulnAgent, runVuln, vulnType, exploitAgent, runExploit]) => {
        state.agentMetrics[vulnAgent] = await runVuln(input);
        state.completedAgents.push(vulnAgent);

        const decision = await acts.checkExploitationQueue(input, vulnType);
        if (decision.shouldExploit) {
          state.agentMetrics[exploitAgent] = await runExploit(input);
          state.completedAgents.push(exploitAgent);
        }
      })
    );

    state.currentPhase = "reporting";
    state.currentAgent = "report";
    await acts.assembleReportActivity(input);
    state.agentMetrics.report = await acts.runReportAgent(input);
    state.completedAgents.push("report");

    state.status = "completed";
    state.currentPhase = "completed";
    state.currentAgent = null;
    state.summary = {
      totalCostUsd: Number(
        Object.values(state.agentMetrics).reduce((sum, item) => sum + item.costUsd, 0).toFixed(4)
      ),
      totalDurationMs: Date.now() - state.startTime,
      totalTurns: Object.values(state.agentMetrics).reduce((sum, item) => sum + item.turns, 0),
      agentCount: state.completedAgents.length
    };

    await acts.logWorkflowComplete(input, toWorkflowSummary(input, state));

    return state;
  } catch (error) {
    state.status = "failed";
    state.currentPhase = "failed";
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    state.summary = {
      totalCostUsd: Number(
        Object.values(state.agentMetrics).reduce((sum, item) => sum + item.costUsd, 0).toFixed(4)
      ),
      totalDurationMs: Date.now() - state.startTime,
      totalTurns: Object.values(state.agentMetrics).reduce((sum, item) => sum + item.turns, 0),
      agentCount: state.completedAgents.length
    };

    await acts.logWorkflowComplete(input, toWorkflowSummary(input, state));
    throw error;
  }
}

function toWorkflowSummary(input: PipelineInput, state: PipelineState): WorkflowSummary {
  const summary = state.summary ?? {
    totalCostUsd: Number(
      Object.values(state.agentMetrics).reduce((sum, item) => sum + item.costUsd, 0).toFixed(4)
    ),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: Object.values(state.agentMetrics).reduce((sum, item) => sum + item.turns, 0),
    agentCount: state.completedAgents.length
  };

  return {
    id: input.workflowId,
    scanRunId: input.workflowId,
    reportId: `${input.workflowId}-report`,
    status:
      state.status === "failed" ? "failed" : state.status === "completed" ? "completed" : "running",
    currentPhase: (state.currentPhase ?? "completed") as WorkflowSummary["currentPhase"],
    targetUrl: input.webUrl,
    repoPath: input.repoPath,
    workspace: input.sessionId,
    reportPath: `${input.outputPath ?? "./audit-logs"}/${input.sessionId}/comprehensive_security_assessment_report.md`,
    startedAt: new Date(state.startTime).toISOString(),
    endedAt: state.status === "running" ? null : new Date().toISOString(),
    durationMs: summary.totalDurationMs,
    totalCostUsd: summary.totalCostUsd,
    totalTurns: summary.totalTurns,
    agentCount: summary.agentCount,
    phaseHistory: state.completedAgents.map((agentName) => ({
      phase:
        agentName === "report"
          ? "reporting"
          : agentName === "recon"
            ? "recon"
            : "analysis",
      changedAt: new Date().toISOString()
    })),
    agentBreakdown: Object.entries(state.agentMetrics).map(([agentName, metrics]) => ({
      id: agentName,
      label: agentName,
      status: state.completedAgents.includes(agentName as (typeof state.completedAgents)[number])
        ? "completed"
        : "running",
      durationMs: metrics.durationMs,
      turns: metrics.turns,
      costUsd: metrics.costUsd
    }))
  };
}
