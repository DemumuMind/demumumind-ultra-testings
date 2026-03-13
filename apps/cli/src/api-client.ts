import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";

export interface BrowserLoginResult {
  sessionId: string;
  authorizationUrl: string;
  state: string;
}

export interface DeviceLoginStartResult {
  sessionId: string;
  verificationUri: string;
  userCode: string;
  intervalSeconds: number;
}

export type DeviceLoginPollResult =
  | {
      status: "pending";
    }
  | {
      status: "connected";
      connection: {
        profile: {
          email: string;
          name: string;
        };
      };
    };

export interface ShannonApiClient {
  startBrowserLogin(
    userId: string,
    provider: "openai" | "nvidia",
    redirectUri?: string
  ): Promise<BrowserLoginResult>;
  completeBrowserLogin(input: {
    userId: string;
    code: string;
    state: string;
  }): Promise<{
    profile: {
      email: string;
      name: string;
    };
  }>;
  startDeviceLogin(
    userId: string,
    provider: "openai" | "nvidia"
  ): Promise<DeviceLoginStartResult>;
  pollDeviceLogin(input: { userId: string; sessionId: string }): Promise<DeviceLoginPollResult>;
  logout(userId: string): Promise<void>;
  getConnection(userId: string): Promise<{
    profile: {
      email: string;
      name: string;
    };
  } | null>;
  getAuthStatus(userId: string): Promise<{
    connected: boolean;
    profile: {
      email: string;
      name: string;
    } | null;
  }>;
  getProviders(): Promise<
    Array<{
      kind: "openai" | "nvidia";
      label: string;
      status: string;
      authStrategies: string[];
    }>
  >;
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

  async startBrowserLogin(
    userId: string,
    provider: "openai" | "nvidia",
    redirectUri?: string
  ): Promise<BrowserLoginResult> {
    return this.post("/api/auth/browser/start", {
      userId,
      provider,
      redirectUri
    });
  }

  async completeBrowserLogin(input: {
    userId: string;
    code: string;
    state: string;
  }): Promise<{
    profile: {
      email: string;
      name: string;
    };
  }> {
    return this.post("/api/auth/browser/callback", input);
  }

  async startDeviceLogin(
    userId: string,
    provider: "openai" | "nvidia"
  ): Promise<DeviceLoginStartResult> {
    return this.post("/api/auth/device/start", {
      userId,
      provider
    });
  }

  async pollDeviceLogin(input: {
    userId: string;
    sessionId: string;
  }): Promise<DeviceLoginPollResult> {
    return this.post("/api/auth/device/poll", input);
  }

  async logout(userId: string): Promise<void> {
    await this.post("/api/auth/logout", {
      userId
    });
  }

  async getConnection(userId: string) {
    const response = await fetch(new URL(`/api/auth/users/${userId}/connection`, this.baseUrl), {
      method: "GET"
    });

    if (response.status === 404) {
      return null;
    }

    return readJsonOrThrow<{
      profile: {
        email: string;
        name: string;
      };
    }>(response);
  }

  async getAuthStatus(userId: string) {
    return this.get<{
      connected: boolean;
      profile: {
        email: string;
        name: string;
      } | null;
    }>(`/api/auth/status/${userId}`);
  }

  async getProviders() {
    return this.get<
      Array<{
        kind: "openai" | "nvidia";
        label: string;
        status: string;
        authStrategies: string[];
      }>
    >("/api/providers");
  }

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
