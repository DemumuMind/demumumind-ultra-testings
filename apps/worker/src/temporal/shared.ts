import type { PipelineAgentName, PipelineProgress, PipelineState, PipelineVulnType } from "@shannon/shared";

export const TASK_QUEUE = "shannon-pipeline";
export const WORKFLOW_NAME = "pentestPipelineWorkflow";
export const PROGRESS_QUERY = "getProgress";

export const PIPELINE_AGENTS: PipelineAgentName[] = [
  "pre-recon",
  "recon",
  "injection-vuln",
  "xss-vuln",
  "auth-vuln",
  "ssrf-vuln",
  "authz-vuln",
  "injection-exploit",
  "xss-exploit",
  "auth-exploit",
  "ssrf-exploit",
  "authz-exploit",
  "report"
];

export const PIPELINE_VULN_TYPES: PipelineVulnType[] = [
  "injection",
  "xss",
  "auth",
  "ssrf",
  "authz"
];

export function buildProgress(
  workflowId: string,
  state: PipelineState,
  now = Date.now()
): PipelineProgress {
  return {
    ...state,
    workflowId,
    elapsedMs: now - state.startTime
  };
}
