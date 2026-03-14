import type { PipelineProgress, WorkflowDetail, WorkflowSummary } from "@shannon/shared";

export function shouldPollWorkflow(input: {
  workflowDetail: WorkflowDetail | null;
  workflowSummary: WorkflowSummary | null;
  workflowProgress: PipelineProgress | null;
}): boolean {
  if (input.workflowProgress?.status === "running") {
    return true;
  }

  if (input.workflowDetail?.workflow.status === "running") {
    return true;
  }

  return input.workflowSummary?.status === "running";
}
