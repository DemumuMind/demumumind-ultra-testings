import type {
  CcsStatus,
  PipelineProgress,
  WorkspaceArtifactKind,
  WorkspaceArtifactPreview,
  WorkflowDetail,
  WorkspaceDetail,
  WorkflowSummary,
  WorkspaceSummary
} from "@shannon/shared";

export interface ProviderResponse {
  kind: "openai" | "nvidia";
  label: string;
  status: string;
  authStrategies: string[];
}

export interface RuntimeHealthResponse {
  healthy: boolean;
  mode: "temporal";
}

const API_BASE_URL =
  (import.meta as ImportMeta & { env: { VITE_DEMUMUMIND_API_BASE_URL?: string } }).env
    .VITE_DEMUMUMIND_API_BASE_URL ?? "http://127.0.0.1:4000";

function resolveApiUrl(path: string): URL {
  return new URL(path, API_BASE_URL);
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }

  return data;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(resolveApiUrl(path));
  return readJson<T>(response);
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return readJson<T>(response);
}

export async function getCcsStatus(): Promise<CcsStatus> {
  return get<CcsStatus>("/api/integrations/ccs/status");
}

export async function connectOpenAiWithCcs(): Promise<CcsStatus> {
  return post<CcsStatus>("/api/integrations/ccs/openai/connect", {});
}

export async function startCcsDashboard(): Promise<CcsStatus> {
  return post<CcsStatus>("/api/integrations/ccs/dashboard/start", {});
}

export async function stopCcsDashboard(): Promise<CcsStatus> {
  return post<CcsStatus>("/api/integrations/ccs/dashboard/stop", {});
}

export async function getProviders(): Promise<ProviderResponse[]> {
  return get<ProviderResponse[]>("/api/providers");
}

export async function getRuntimeHealth(): Promise<RuntimeHealthResponse> {
  return get<RuntimeHealthResponse>("/api/runtime/health");
}

export async function getWorkflows(): Promise<WorkflowSummary[]> {
  return get<WorkflowSummary[]>("/api/workflows");
}

export async function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return get<WorkflowDetail>(`/api/workflows/${workflowId}`);
}

export async function getWorkflowProgress(workflowId: string): Promise<PipelineProgress> {
  return get<PipelineProgress>(`/api/workflows/${workflowId}/progress`);
}

export async function getWorkspaces(): Promise<WorkspaceSummary[]> {
  return get<WorkspaceSummary[]>("/api/workspaces");
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
  return get<WorkspaceDetail>(`/api/workspaces/${workspaceId}`);
}

export async function getWorkspaceArtifactPreview(
  workspaceId: string,
  artifactKind: WorkspaceArtifactKind
): Promise<WorkspaceArtifactPreview> {
  return get<WorkspaceArtifactPreview>(
    `/api/workspaces/${workspaceId}/artifacts/${artifactKind}/preview`
  );
}

export function getWorkspaceArtifactDownloadUrl(
  workspaceId: string,
  artifactKind: WorkspaceArtifactKind
): string {
  return resolveApiUrl(`/api/workspaces/${workspaceId}/artifacts/${artifactKind}/download`).toString();
}

export async function startWorkflow(input: {
  userId: string;
  url: string;
  repo: string;
  workspace?: string;
  config?: string;
  output?: string;
}): Promise<WorkflowSummary> {
  return post("/api/workflows/start", input);
}

export async function stopWorkflow(workflowId: string): Promise<WorkflowSummary> {
  return post(`/api/workflows/${workflowId}/stop`, {});
}

export async function stopRuntime(input: { clean?: boolean }): Promise<{
  status: "stopped";
  clean: boolean;
  message: string;
}> {
  return post("/api/runtime/stop", input);
}
