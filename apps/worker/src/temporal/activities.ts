import { heartbeat } from "@temporalio/activity";
import { writeFile } from "node:fs/promises";

import type {
  PipelineAgentMetrics,
  PipelineAgentName,
  PipelineInput,
  PipelineState,
  PipelineSummary,
  PipelineVulnType,
  WorkflowSummary
} from "@shannon/shared";

import { AgentExecutionService, AGENT_DELIVERABLES } from "../services/agent-execution.js";
import { AuditSession } from "../services/audit-session.js";
import { createGitCheckpoint, restoreGitCheckpoint as restoreGitState } from "../services/git-manager.js";
import { runPreflightChecks } from "../services/preflight.js";
import { assembleFinalReport } from "../services/reporting.js";

const agentExecution = new AgentExecutionService();

export interface ResumeState {
  workspaceName: string;
  checkpointHash: string;
  completedAgents: PipelineAgentName[];
  originalWorkflowId: string;
}

function auditSession(input: PipelineInput): AuditSession {
  return new AuditSession({
    auditRoot: input.outputPath ?? "./audit-logs",
    sessionId: input.sessionId,
    workflowId: input.workflowId,
    webUrl: input.webUrl,
    repoPath: input.repoPath
  });
}

function summarize(state: PipelineState): PipelineSummary {
  const metrics = Object.values(state.agentMetrics);
  return {
    totalCostUsd: Number(metrics.reduce((sum, item) => sum + item.costUsd, 0).toFixed(4)),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: metrics.reduce((sum, item) => sum + item.turns, 0),
    agentCount: state.completedAgents.length
  };
}

export async function runPreflightValidation(input: PipelineInput): Promise<void> {
  heartbeat({ phase: "preflight" });
  await auditSession(input).initialize();
  await runPreflightChecks(input.repoPath, input.configPath);
}

async function runAgentActivity(
  agentName: PipelineAgentName,
  input: PipelineInput
): Promise<PipelineAgentMetrics> {
  heartbeat({ agentName });
  const session = auditSession(input);
  await session.initialize();
  await session.logPhaseStart(agentName);

  const metrics = await agentExecution.runAgent(agentName, input);
  const checkpointHash = await createGitCheckpoint(input.repoPath, agentName);
  await session.markAgentCompleted({
    agentName,
    checkpointHash,
    deliverableFilename: AGENT_DELIVERABLES[agentName],
    metrics
  });
  return metrics;
}

export const runPreReconAgent = (input: PipelineInput) => runAgentActivity("pre-recon", input);
export const runReconAgent = (input: PipelineInput) => runAgentActivity("recon", input);
export const runInjectionVulnAgent = (input: PipelineInput) =>
  runAgentActivity("injection-vuln", input);
export const runXssVulnAgent = (input: PipelineInput) => runAgentActivity("xss-vuln", input);
export const runAuthVulnAgent = (input: PipelineInput) => runAgentActivity("auth-vuln", input);
export const runSsrfVulnAgent = (input: PipelineInput) => runAgentActivity("ssrf-vuln", input);
export const runAuthzVulnAgent = (input: PipelineInput) => runAgentActivity("authz-vuln", input);
export const runInjectionExploitAgent = (input: PipelineInput) =>
  runAgentActivity("injection-exploit", input);
export const runXssExploitAgent = (input: PipelineInput) =>
  runAgentActivity("xss-exploit", input);
export const runAuthExploitAgent = (input: PipelineInput) =>
  runAgentActivity("auth-exploit", input);
export const runSsrfExploitAgent = (input: PipelineInput) =>
  runAgentActivity("ssrf-exploit", input);
export const runAuthzExploitAgent = (input: PipelineInput) =>
  runAgentActivity("authz-exploit", input);
export const runReportAgent = (input: PipelineInput) => runAgentActivity("report", input);

export async function checkExploitationQueue(
  input: PipelineInput,
  vulnType: PipelineVulnType
): Promise<{ shouldExploit: boolean; vulnerabilityCount: number }> {
  const shouldExploit = await agentExecution.hasQueuedFindings(input.repoPath, vulnType);
  return {
    shouldExploit,
    vulnerabilityCount: shouldExploit ? 1 : 0
  };
}

export async function assembleReportActivity(input: PipelineInput): Promise<void> {
  const session = auditSession(input);
  const { report } = await assembleFinalReport(input.repoPath, input.workflowId);
  await writeFile(session.reportPath(), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function injectReportMetadataActivity(_input: PipelineInput): Promise<void> {
  // Reserved for later model metadata enrichment.
}

export async function loadResumeState(
  workspaceName: string,
  _expectedUrl: string,
  _expectedRepoPath: string
): Promise<ResumeState> {
  return {
    workspaceName,
    checkpointHash: "HEAD",
    completedAgents: [],
    originalWorkflowId: workspaceName
  };
}

export async function restoreGitCheckpoint(
  repoPath: string,
  checkpointHash: string,
  _incompleteAgents: PipelineAgentName[]
): Promise<void> {
  await restoreGitState(repoPath, checkpointHash);
}

export async function recordResumeAttempt(
  input: PipelineInput,
  terminatedWorkflows: string[],
  checkpointHash: string,
  _previousWorkflowId: string,
  _completedAgents: PipelineAgentName[]
): Promise<void> {
  await auditSession(input).addResumeAttempt(input.workflowId, terminatedWorkflows, checkpointHash);
}

export async function logPhaseTransition(
  input: PipelineInput,
  phase: string,
  event: "start" | "complete"
): Promise<void> {
  const session = auditSession(input);
  if (event === "start") {
    await session.logPhaseStart(phase);
    return;
  }

  await session.logPhaseComplete(phase);
}

export async function logWorkflowComplete(
  input: PipelineInput,
  summary: WorkflowSummary
): Promise<void> {
  const session = auditSession(input);
  await session.finalize({
    status: summary.status,
    reportPath: summary.reportPath
  });
  await writeFile(session.workflowSummaryPath(), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export function toWorkflowSummary(input: {
  pipeline: PipelineInput;
  state: PipelineState;
}): WorkflowSummary {
  const summary = input.state.summary ?? summarize(input.state);

  return {
    id: input.pipeline.workflowId,
    scanRunId: input.pipeline.workflowId,
    reportId: `${input.pipeline.workflowId}-report`,
    status:
      input.state.status === "failed"
        ? "failed"
        : input.state.status === "completed"
          ? "completed"
          : "running",
    currentPhase: (input.state.currentPhase as WorkflowSummary["currentPhase"]) ?? "completed",
    targetUrl: input.pipeline.webUrl,
    repoPath: input.pipeline.repoPath,
    workspace: input.pipeline.sessionId,
    reportPath: `${input.pipeline.outputPath ?? "./audit-logs"}/${input.pipeline.sessionId}/comprehensive_security_assessment_report.md`,
    startedAt: new Date(input.state.startTime).toISOString(),
    endedAt: input.state.status === "running" ? null : new Date().toISOString(),
    durationMs: summary.totalDurationMs,
    totalCostUsd: summary.totalCostUsd,
    totalTurns: summary.totalTurns,
    agentCount: summary.agentCount,
    phaseHistory: input.state.completedAgents.map((agentName) => ({
      phase:
        agentName === "report"
          ? "reporting"
          : agentName === "recon"
            ? "recon"
            : "analysis",
      changedAt: new Date().toISOString()
    })),
    agentBreakdown: Object.entries(input.state.agentMetrics).map(([agentName, metrics]) => ({
      id: agentName,
      label: agentName,
      status: input.state.completedAgents.includes(agentName as PipelineAgentName)
        ? "completed"
        : "running",
      durationMs: metrics.durationMs,
      turns: metrics.turns,
      costUsd: metrics.costUsd
    }))
  };
}
