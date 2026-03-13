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
  startBrowserLogin(userId: string, redirectUri?: string): Promise<BrowserLoginResult>;
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
  startDeviceLogin(userId: string): Promise<DeviceLoginStartResult>;
  pollDeviceLogin(input: { userId: string; sessionId: string }): Promise<DeviceLoginPollResult>;
  logout(userId: string): Promise<void>;
  getConnection(userId: string): Promise<{
    profile: {
      email: string;
      name: string;
    };
  } | null>;
  createTarget(input: {
    name: string;
    baseUrl: string;
    sourceBundlePath: string;
    verificationMode: "passive" | "simulation";
  }): Promise<{
    id: string;
    name: string;
    baseUrl: string;
    sourceBundlePath: string;
    verificationMode: "passive" | "simulation";
  }>;
  runScan(input: { userId: string; targetId?: string; projectId?: string }): Promise<{
    id: string;
    status: string;
    targetId: string;
    projectId?: string | null;
  }>;
  getReport(scanRunId: string): Promise<{
    report: {
      id: string;
      scanRunId: string;
      findingIds: string[];
      coverageMatrix?: Array<{
        id: string;
        title: string;
        status: string;
        proofType: string;
      }>;
      unsupportedClasses?: string[];
    };
    findings: unknown[];
  }>;
  getDoctorReport(): Promise<{
    status: string;
    checks: Array<{
      id: string;
      status: string;
      summary: string;
    }>;
  }>;
  getProviders(): Promise<
    Array<{
      kind: string;
      label?: string;
      status: string;
    }>
  >;
  getCapabilities(): Promise<
    Array<{
      id: string;
      name?: string;
      category?: string;
      permissionLevel: string;
    }>
  >;
  initProject(input: {
    projectRoot: string;
    name: string;
    baseUrl: string;
    sourceRoots: string[];
    providerPreferences?: Array<"openai" | "nvidia">;
  }): Promise<{
    project: {
      id: string;
      name: string;
      proofMode: string;
    };
    configPath: string;
    policyPath: string;
  }>;
  getProjects(): Promise<
    Array<{
      id: string;
      name: string;
      baseUrl?: string;
    }>
  >;
  attachRunner(input?: { name?: string }): Promise<{
    id: string;
    mode: string;
    status: string;
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

  async startBrowserLogin(userId: string, redirectUri?: string): Promise<BrowserLoginResult> {
    return this.post("/api/auth/browser/start", {
      userId,
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

  async startDeviceLogin(userId: string): Promise<DeviceLoginStartResult> {
    return this.post("/api/auth/device/start", {
      userId
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

  async createTarget(input: {
    name: string;
    baseUrl: string;
    sourceBundlePath: string;
    verificationMode: "passive" | "simulation";
  }): Promise<{
    id: string;
    name: string;
    baseUrl: string;
    sourceBundlePath: string;
    verificationMode: "passive" | "simulation";
  }> {
    return this.post("/api/targets", input);
  }

  async runScan(input: {
    userId: string;
    targetId?: string;
    projectId?: string;
  }): Promise<{
    id: string;
    status: string;
    targetId: string;
    projectId?: string | null;
  }> {
    return this.post("/api/scans", input);
  }

  async getReport(scanRunId: string) {
    const response = await fetch(new URL(`/api/reports/${scanRunId}`, this.baseUrl), {
      method: "GET"
    });
    return readJsonOrThrow<{
      report: {
        id: string;
        scanRunId: string;
        findingIds: string[];
        coverageMatrix?: Array<{
          id: string;
          title: string;
          status: string;
          proofType: string;
        }>;
        unsupportedClasses?: string[];
      };
      findings: unknown[];
    }>(response);
  }

  async getDoctorReport() {
    return this.get<{
      status: string;
      checks: Array<{
        id: string;
        status: string;
        summary: string;
      }>;
    }>("/api/bootstrap/doctor");
  }

  async getProviders() {
    return this.get<
      Array<{
        kind: string;
        label?: string;
        status: string;
      }>
    >("/api/providers");
  }

  async getCapabilities() {
    return this.get<
      Array<{
        id: string;
        name?: string;
        category?: string;
        permissionLevel: string;
      }>
    >("/api/capabilities");
  }

  async initProject(input: {
    projectRoot: string;
    name: string;
    baseUrl: string;
    sourceRoots: string[];
    providerPreferences?: Array<"openai" | "nvidia">;
  }) {
    return this.post<{
      project: {
        id: string;
        name: string;
        proofMode: string;
      };
      configPath: string;
      policyPath: string;
    }>("/api/projects/init", input);
  }

  async getProjects() {
    return this.get<
      Array<{
        id: string;
        name: string;
        baseUrl?: string;
      }>
    >("/api/projects");
  }

  async attachRunner(input?: { name?: string }) {
    return this.post<{
      id: string;
      mode: string;
      status: string;
    }>("/api/runners/attach", input ?? {});
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
