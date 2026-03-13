import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";

export interface ProviderResponse {
  kind: "openai" | "nvidia";
  label: string;
  status: string;
  authStrategies: string[];
}

export interface AuthStatusResponse {
  connected: boolean;
  profile: {
    email: string;
    name: string;
  } | null;
}

const API_BASE_URL =
  (import.meta as ImportMeta & { env: { VITE_DEMUMUMIND_API_BASE_URL?: string } }).env
    .VITE_DEMUMUMIND_API_BASE_URL ?? "http://127.0.0.1:4000";

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }

  return data;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, API_BASE_URL));
  return readJson<T>(response);
}

export async function getAuthStatus(userId: string): Promise<AuthStatusResponse> {
  return get<AuthStatusResponse>(`/api/auth/status/${userId}`);
}

export async function getProviders(): Promise<ProviderResponse[]> {
  return get<ProviderResponse[]>("/api/providers");
}

export async function getWorkflows(): Promise<WorkflowSummary[]> {
  return get<WorkflowSummary[]>("/api/workflows");
}

export async function getWorkflow(workflowId: string): Promise<WorkflowDetail> {
  return get<WorkflowDetail>(`/api/workflows/${workflowId}`);
}

export async function getWorkspaces(): Promise<WorkspaceSummary[]> {
  return get<WorkspaceSummary[]>("/api/workspaces");
}
