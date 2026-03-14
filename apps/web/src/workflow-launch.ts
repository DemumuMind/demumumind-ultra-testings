import type { WorkspaceSummary } from "@shannon/shared";

export interface LaunchDraft {
  url: string;
  repo: string;
  workspace: string;
  config: string;
  output: string;
}

export function createEmptyLaunchDraft(): LaunchDraft {
  return {
    url: "",
    repo: "",
    workspace: "",
    config: "",
    output: ""
  };
}

function trimRequired(value: string, label: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }

  return trimmed;
}

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildLaunchInput(input: {
  userId: string;
  draft: LaunchDraft;
}): {
  userId: string;
  url: string;
  repo: string;
  workspace?: string;
  config?: string;
  output?: string;
} {
  return {
    userId: input.userId,
    url: trimRequired(input.draft.url, "Target URL"),
    repo: trimRequired(input.draft.repo, "Repository Path"),
    ...(trimOptional(input.draft.workspace)
      ? { workspace: trimOptional(input.draft.workspace) }
      : {}),
    ...(trimOptional(input.draft.config) ? { config: trimOptional(input.draft.config) } : {}),
    ...(trimOptional(input.draft.output) ? { output: trimOptional(input.draft.output) } : {})
  };
}

export function buildResumeDraft(workspace: WorkspaceSummary): LaunchDraft {
  return {
    url: workspace.targetUrl,
    repo: workspace.repoPath,
    workspace: workspace.name,
    config: "",
    output: ""
  };
}
