import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";

export interface ShannonApiClient {
  startWorkflow(input: {
    userId: string;
    url: string;
    repo: string;
    config?: string;
    output?: string;
    workspace?: string;
  }): Promise<WorkflowSummary>;
  getWorkflow(workflowId: string): Promise<WorkflowDetail>;
  getWorkflowLogs(workflowId: string): Promise<{
    workflowId: string;
    logs: string[];
  }>;
  getWorkspaces(): Promise<WorkspaceSummary[]>;
  stopRuntime(input: { clean?: boolean }): Promise<{
    status: "stopped";
    clean: boolean;
    message: string;
  }>;
}

async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }

  return body;
}

export class FetchShannonApiClient implements ShannonApiClient {
  constructor(private readonly baseUrl: string) {}

  async startWorkflow(input: {
    userId: string;
    url: string;
    repo: string;
    config?: string;
    output?: string;
    workspace?: string;
  }): Promise<WorkflowSummary> {
    return this.post("/api/workflows/start", input);
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetail> {
    return this.get<WorkflowDetail>(`/api/workflows/${workflowId}`);
  }

  async getWorkflowLogs(workflowId: string) {
    return this.get<{
      workflowId: string;
      logs: string[];
    }>(`/api/workflows/${workflowId}/logs`);
  }

  async getWorkspaces(): Promise<WorkspaceSummary[]> {
    return this.get<WorkspaceSummary[]>("/api/workspaces");
  }

  async stopRuntime(input: { clean?: boolean }) {
    return this.post<{
      status: "stopped";
      clean: boolean;
      message: string;
    }>("/api/runtime/stop", input);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "GET"
    });
    return readJsonOrThrow<T>(response);
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return readJsonOrThrow<T>(response);
  }
}
