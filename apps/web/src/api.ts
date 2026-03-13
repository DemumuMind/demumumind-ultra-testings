export interface ProjectResponse {
  id: string;
  name: string;
  projectRoot?: string;
  sourceRoots: string[];
  target?: {
    baseUrl: string;
  };
  proofMode?: string;
  baseUrl?: string;
}

export interface ProjectPolicyResponse {
  activeValidationAllowed: boolean;
  destructiveChecksEnabled: boolean;
  allowedExploitClasses: string[];
}

export interface AuthStatusResponse {
  connected: boolean;
  profile: {
    email: string;
    name: string;
  } | null;
}

export interface RunnerResponse {
  id: string;
  name: string;
  mode: string;
  status: string;
  endpoint?: string;
  managed: boolean;
  lastSeenAt: string;
}

export interface ScanResponse {
  id: string;
  status: string;
  targetId: string;
  projectId?: string | null;
  phaseHistory: Array<{
    phase: string;
  }>;
}

export interface ReportResponse {
  report: {
    id: string;
    scanRunId: string;
    findingIds: string[];
    exploitPacks: Array<{
      id: string;
      title: string;
      attackDomain: string;
      proofType: string;
      permissionLevel: string;
    }>;
    coverageMatrix: Array<{
      id: string;
      title: string;
      status: string;
      proofType: string;
    }>;
    unsupportedClasses: string[];
  };
  findings: Array<{
    id: string;
    attackDomain: string;
    title: string;
    proofOfImpact: string;
    proofType: string;
  }>;
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

async function post<T>(path: string, payload: unknown): Promise<T> {
  return sendJson("POST", path, payload);
}

async function patch<T>(path: string, payload: unknown): Promise<T> {
  return sendJson("PATCH", path, payload);
}

async function del(path: string): Promise<void> {
  const response = await fetch(new URL(path, API_BASE_URL), {
    method: "DELETE"
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ error: undefined }))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }
}

async function sendJson<T>(method: "POST" | "PATCH", path: string, payload: unknown): Promise<T> {
  const response = await fetch(new URL(path, API_BASE_URL), {
    method,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return readJson<T>(response);
}

export async function getDoctorReport(): Promise<{
  status: string;
  checks: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
}> {
  const response = await fetch(new URL("/api/bootstrap/doctor", API_BASE_URL));
  return readJson(response);
}

export async function getProjects(): Promise<ProjectResponse[]> {
  const response = await fetch(new URL("/api/projects", API_BASE_URL));
  return readJson<ProjectResponse[]>(response);
}

export async function getProviders(): Promise<
  Array<{
    kind: string;
    status: string;
  }>
> {
  const response = await fetch(new URL("/api/providers", API_BASE_URL));
  return readJson(response);
}

export async function getCapabilities(): Promise<
  Array<{
    id: string;
    category: string;
    permissionLevel: string;
  }>
> {
  const response = await fetch(new URL("/api/capabilities", API_BASE_URL));
  return readJson(response);
}

export async function getRunners(): Promise<
  RunnerResponse[]
> {
  const response = await fetch(new URL("/api/runners", API_BASE_URL));
  return readJson(response);
}

export async function getScans(): Promise<ScanResponse[]> {
  const response = await fetch(new URL("/api/scans", API_BASE_URL));
  return readJson<ScanResponse[]>(response);
}

export async function getReport(scanRunId: string): Promise<ReportResponse> {
  const response = await fetch(new URL(`/api/reports/${scanRunId}`, API_BASE_URL));
  return readJson<ReportResponse>(response);
}

export async function getConnection(userId: string): Promise<{ profile: { email: string } } | null> {
  const response = await fetch(new URL(`/api/auth/users/${userId}/connection`, API_BASE_URL));

  if (response.status === 404) {
    return null;
  }

  return readJson<{ profile: { email: string } }>(response);
}

export async function getAuthStatus(userId: string): Promise<AuthStatusResponse> {
  const response = await fetch(new URL(`/api/auth/status/${userId}`, API_BASE_URL));
  return readJson<AuthStatusResponse>(response);
}

export async function logout(userId: string): Promise<void> {
  const response = await fetch(new URL("/api/auth/logout", API_BASE_URL), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      userId
    })
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({ error: undefined }))) as { error?: string };
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }
}

export async function startBrowserLogin(userId: string) {
  return post<{
    authorizationUrl: string;
  }>("/api/auth/browser/start", {
    userId
  });
}

export async function startDeviceLogin(userId: string) {
  return post<{
    sessionId: string;
    verificationUri: string;
    userCode: string;
  }>("/api/auth/device/start", {
    userId
  });
}

export async function pollDeviceLogin(userId: string, sessionId: string) {
  return post<
    | {
        status: "pending";
      }
    | {
        status: "connected";
        connection: {
          profile: {
            email: string;
          };
        };
      }
  >("/api/auth/device/poll", {
    userId,
    sessionId
  });
}

export async function initProject(input: {
  name: string;
  baseUrl: string;
  projectRoot: string;
  sourceRoots: string[];
}) {
  return post<{
    project: ProjectResponse;
    configPath: string;
    policyPath: string;
  }>("/api/projects/init", input);
}

export async function getPolicy(projectId: string): Promise<ProjectPolicyResponse> {
  const response = await fetch(new URL(`/api/projects/${projectId}/policy`, API_BASE_URL));
  return readJson<ProjectPolicyResponse>(response);
}

export async function updatePolicy(
  projectId: string,
  input: Partial<ProjectPolicyResponse>
): Promise<ProjectPolicyResponse> {
  return patch<ProjectPolicyResponse>(`/api/projects/${projectId}/policy`, input);
}

export async function attachRunner(input?: { name?: string; endpoint?: string }) {
  return post<RunnerResponse>("/api/runners/attach", input ?? {});
}

export async function updateRunner(
  runnerId: string,
  input: {
    status?: "ready" | "busy" | "offline";
  }
): Promise<RunnerResponse> {
  return patch<RunnerResponse>(`/api/runners/${runnerId}`, input);
}

export async function detachRunner(runnerId: string): Promise<void> {
  await del(`/api/runners/${runnerId}`);
}

export async function runScan(input: { userId: string; projectId?: string; targetId?: string }) {
  return post<ScanResponse>("/api/scans", input);
}
