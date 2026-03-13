import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState
} from "react";
import { AppShell } from "./app-shell.js";
import {
  attachRunner,
  detachRunner,
  getAuthStatus,
  getCapabilities,
  getDoctorReport,
  getPolicy,
  getProjects,
  getProviders,
  getReport,
  getRunners,
  getScans,
  initProject,
  logout,
  pollDeviceLogin,
  runScan,
  startBrowserLogin,
  startDeviceLogin,
  updatePolicy,
  updateRunner
} from "./api.js";

interface ExploitPackSummary {
  id: string;
  title: string;
  attackDomain: string;
  proofType: string;
  permissionLevel: string;
}

const DEFAULT_EXPLOIT_PACKS: ExploitPackSummary[] = [
  {
    id: "auth-safe-pack",
    title: "Authentication Safe Pack",
    attackDomain: "authentication",
    proofType: "safe",
    permissionLevel: "safe"
  },
  {
    id: "authorization-safe-pack",
    title: "Authorization Safe Pack",
    attackDomain: "authorization",
    proofType: "safe",
    permissionLevel: "safe"
  },
  {
    id: "graphql-safe-pack",
    title: "GraphQL Safe Pack",
    attackDomain: "graphql",
    proofType: "safe",
    permissionLevel: "safe"
  },
  {
    id: "xss-safe-pack",
    title: "XSS Safe Pack",
    attackDomain: "xss",
    proofType: "safe",
    permissionLevel: "safe"
  },
  {
    id: "ssrf-safe-pack",
    title: "SSRF Safe Pack",
    attackDomain: "ssrf",
    proofType: "safe",
    permissionLevel: "safe"
  },
  {
    id: "business-logic-safe-pack",
    title: "Business Logic Safe Pack",
    attackDomain: "business-logic",
    proofType: "safe",
    permissionLevel: "safe"
  }
];

function deriveExploitPacks(latestReport: {
  report: {
    coverageMatrix: Array<{
      id: string;
      proofType: string;
    }>;
  };
} | null): ExploitPackSummary[] {
  if (!latestReport) {
    return DEFAULT_EXPLOIT_PACKS;
  }

  const proofByCoverageId = new Map(
    latestReport.report.coverageMatrix.map((item) => [item.id, item.proofType])
  );
  const coverageIdByPackId: Record<string, string> = {
    "auth-safe-pack": "authentication",
    "authorization-safe-pack": "authorization",
    "graphql-safe-pack": "graphql-abuse",
    "xss-safe-pack": "xss",
    "ssrf-safe-pack": "ssrf",
    "business-logic-safe-pack": "business-logic"
  };

  return DEFAULT_EXPLOIT_PACKS.map((pack) => {
    const coverageId = coverageIdByPackId[pack.id];

    return {
      ...pack,
      proofType: (coverageId ? proofByCoverageId.get(coverageId) : undefined) ?? pack.proofType
    };
  });
}

export function App() {
  const [userId, setUserId] = useState("local-cli-user");
  const [authState, setAuthState] = useState<"connected" | "pending" | "disconnected">(
    "disconnected"
  );
  const [connectionEmail, setConnectionEmail] = useState<string | null>(null);
  const [doctorStatus, setDoctorStatus] = useState("needs-attention");
  const [projects, setProjects] = useState<
    Array<{
      id: string;
      name: string;
      baseUrl: string;
      sourceRoots: string[];
      proofMode: string;
    }>
  >([]);
  const [providers, setProviders] = useState<Array<{ kind: string; status: string }>>([]);
  const [capabilities, setCapabilities] = useState<
    Array<{ id: string; category: string; permissionLevel: string }>
  >([]);
  const [exploitPacks, setExploitPacks] = useState<ExploitPackSummary[]>(DEFAULT_EXPLOIT_PACKS);
  const [selectedPolicy, setSelectedPolicy] = useState<{
    activeValidationAllowed: boolean;
    destructiveChecksEnabled: boolean;
    allowedExploitClasses: string[];
  } | null>(null);
  const [policyClassInput, setPolicyClassInput] = useState("auth-safe, graphql-introspection");
  const [runners, setRunners] = useState<
    Array<{
      id: string;
      name: string;
      mode: string;
      status: string;
      endpoint?: string;
      managed: boolean;
      lastSeenAt: string;
    }>
  >([]);
  const [scans, setScans] = useState<
    Array<{
      id: string;
      status: string;
      projectId: string;
      phaseHistory: string[];
    }>
  >([]);
  const [latestReport, setLatestReport] = useState<{
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
  } | null>(null);
  const [deviceLogin, setDeviceLogin] = useState<{
    sessionId: string;
    verificationUri: string;
    userCode: string;
  } | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [runnerForm, setRunnerForm] = useState({
    name: "Lab Runner",
    endpoint: "http://127.0.0.1:4310/api"
  });
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [projectForm, setProjectForm] = useState({
    name: "Demo Workspace",
    baseUrl: "http://localhost:3001",
    projectRoot: "C:/demo/project",
    sourceRoot: "C:/demo/project/src"
  });

  const deferredScans = useDeferredValue(scans);

  const loadProjectPolicy = useEffectEvent(async (projectId: string) => {
    const policy = await getPolicy(projectId);
    setSelectedPolicy(policy);
    setPolicyClassInput(policy.allowedExploitClasses.join(", "));
  });

  const refreshDashboard = useEffectEvent(async () => {
    const [doctor, fetchedProjects, fetchedProviders, fetchedCapabilities, fetchedRunners, fetchedScans, authStatus] =
      await Promise.all([
        getDoctorReport(),
        getProjects(),
        getProviders(),
        getCapabilities(),
        getRunners(),
        getScans(),
        getAuthStatus(userId)
      ]);

    setDoctorStatus(doctor.status);
    setProjects(
      fetchedProjects.map((project) => ({
        id: project.id,
        name: project.name,
        baseUrl: project.target?.baseUrl ?? project.baseUrl ?? "http://127.0.0.1",
        sourceRoots: project.sourceRoots,
        proofMode: project.proofMode ?? "safe"
      }))
    );
    setProviders(fetchedProviders);
    setCapabilities(fetchedCapabilities);
    setRunners(fetchedRunners);
    setScans(
      fetchedScans.map((scan) => ({
        id: scan.id,
        status: scan.status,
        projectId: scan.projectId ?? scan.targetId,
        phaseHistory: scan.phaseHistory.map((phase) => phase.phase)
      }))
    );
    setConnectionEmail(authStatus.profile?.email ?? null);
    setAuthState(authStatus.connected ? "connected" : deviceLogin ? "pending" : "disconnected");

    const latestCompleted = [...fetchedScans].reverse().find((scan) => scan.status === "completed");

    if (!latestCompleted) {
      setLatestReport(null);
      setExploitPacks(DEFAULT_EXPLOIT_PACKS);
      return;
    }

    try {
      const report = await getReport(latestCompleted.id);
      setLatestReport(report);
      setExploitPacks(
        report.report.exploitPacks.length > 0 ? report.report.exploitPacks : deriveExploitPacks(report)
      );
    } catch {
      setLatestReport(null);
      setExploitPacks(DEFAULT_EXPLOIT_PACKS);
    }
  });

  useEffect(() => {
    startTransition(() => {
      void refreshDashboard();
    });
  }, [refreshDashboard]);

  useEffect(() => {
    if (!selectedProjectId) {
      setSelectedPolicy(null);
      return;
    }

    void loadProjectPolicy(selectedProjectId);
  }, [loadProjectPolicy, selectedProjectId]);

  async function handleBrowserStart() {
    const result = await startBrowserLogin(userId);
    window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    setAuthState("pending");
    setStatusMessage("Browser login started. Complete the flow in the new tab.");
  }

  async function handleDeviceStart() {
    const result = await startDeviceLogin(userId);
    setDeviceLogin(result);
    setAuthState("pending");
    setStatusMessage("Device login started. Enter the one-time code in your browser.");
  }

  async function handleDevicePoll() {
    if (!deviceLogin) {
      return;
    }

    const result = await pollDeviceLogin(userId, deviceLogin.sessionId);

    if (result.status === "connected") {
      setConnectionEmail(result.connection.profile.email);
      setDeviceLogin(null);
      setAuthState("connected");
      setStatusMessage(`Connected as ${result.connection.profile.email}`);
      return;
    }

    setStatusMessage("Device login is still pending.");
  }

  async function handleLogout() {
    await logout(userId);
    setConnectionEmail(null);
    setDeviceLogin(null);
    setAuthState("disconnected");
    setStatusMessage("Operator session cleared.");
    await refreshDashboard();
  }

  async function handleProjectSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await initProject({
      name: projectForm.name,
      baseUrl: projectForm.baseUrl,
      projectRoot: projectForm.projectRoot,
      sourceRoots: [projectForm.sourceRoot]
    });

    setSelectedProjectId(result.project.id);
    setStatusMessage(`Initialized ${result.project.name} at ${result.configPath}`);
    await refreshDashboard();
    await loadProjectPolicy(result.project.id);
  }

  async function handleSavePolicy() {
    if (!selectedProjectId || !selectedPolicy) {
      setStatusMessage("Choose a project before updating policy.");
      return;
    }

    const allowedExploitClasses = policyClassInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const updated = await updatePolicy(selectedProjectId, {
      activeValidationAllowed: selectedPolicy.activeValidationAllowed,
      destructiveChecksEnabled: selectedPolicy.destructiveChecksEnabled,
      allowedExploitClasses
    });
    setSelectedPolicy(updated);
    setPolicyClassInput(updated.allowedExploitClasses.join(", "));
    setStatusMessage(`Updated policy for ${selectedProjectId}`);
  }

  async function handleRunScan() {
    if (!selectedProjectId) {
      setStatusMessage("Choose a project before running a scan.");
      return;
    }

    const run = await runScan({
      userId,
      projectId: selectedProjectId
    });
    setStatusMessage(`Scan ${run.id} finished with status ${run.status}`);
    await refreshDashboard();
  }

  async function handleAttachRunner() {
    const runner = await attachRunner({
      name: runnerForm.name,
      endpoint: runnerForm.endpoint
    });
    setStatusMessage(`Attached ${runner.name} (${runner.status})`);
    await refreshDashboard();
  }

  async function handleSetRunnerStatus(runnerId: string, status: "ready" | "busy" | "offline") {
    const runner = await updateRunner(runnerId, {
      status
    });
    setStatusMessage(`Runner ${runner.name} is now ${runner.status}`);
    await refreshDashboard();
  }

  async function handleDetachRunner(runnerId: string) {
    await detachRunner(runnerId);
    setStatusMessage(`Detached runner ${runnerId}`);
    await refreshDashboard();
  }

  return (
    <AppShell
      state={{
        operatorId: userId,
        authState,
        connectionEmail,
        doctorStatus,
        projects,
        providers,
        capabilities,
        exploitPacks,
        selectedPolicy,
        runners,
        scans: deferredScans,
        latestReport,
        deviceLogin
      }}
      controls={
        <div className="stack controls-stack">
          <div className="inline-grid">
            <label className="field">
              <span>Operator ID</span>
              <input value={userId} onChange={(event) => setUserId(event.target.value)} />
            </label>
            <div className="button-row">
              <button type="button" onClick={handleBrowserStart}>
                Connect Browser OAuth
              </button>
              <button type="button" className="ghost" onClick={handleDeviceStart}>
                Start Device Auth
              </button>
              {deviceLogin ? (
                <button type="button" className="ghost" onClick={handleDevicePoll}>
                  Poll Device Login
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
                Refresh Auth
              </button>
              <button type="button" className="ghost" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>

          <form className="stack" onSubmit={handleProjectSubmit}>
            <div className="inline-grid">
              <label className="field">
                <span>Project name</span>
                <input
                  value={projectForm.name}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Base URL</span>
                <input
                  value={projectForm.baseUrl}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      baseUrl: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            <div className="inline-grid">
              <label className="field">
                <span>Project root</span>
                <input
                  value={projectForm.projectRoot}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      projectRoot: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Source root</span>
                <input
                  value={projectForm.sourceRoot}
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      sourceRoot: event.target.value
                    }))
                  }
                />
              </label>
            </div>

            <div className="button-row">
              <button type="submit">Initialize Project</button>
              <button type="button" className="ghost" onClick={handleAttachRunner}>
                Attach Runner
              </button>
            </div>
          </form>

          <div className="inline-grid">
            <label className="field">
              <span>Run project</span>
              <select
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">Select a project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button type="button" onClick={handleRunScan}>
                Run Scan
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => (selectedProjectId ? void loadProjectPolicy(selectedProjectId) : undefined)}
              >
                Load Policy
              </button>
            </div>
          </div>

          <div className="stack section-card">
            <div className="card-topline">
              <strong>Project Policy</strong>
              <span className="pill">{selectedProjectId || "no project selected"}</span>
            </div>
            <div className="inline-grid">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={selectedPolicy?.activeValidationAllowed ?? false}
                  disabled={!selectedPolicy}
                  onChange={(event) =>
                    setSelectedPolicy((current) =>
                      current
                        ? {
                            ...current,
                            activeValidationAllowed: event.target.checked
                          }
                        : current
                    )
                  }
                />
                <span>Allow active validation</span>
              </label>
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={selectedPolicy?.destructiveChecksEnabled ?? false}
                  disabled={!selectedPolicy}
                  onChange={(event) =>
                    setSelectedPolicy((current) =>
                      current
                        ? {
                            ...current,
                            destructiveChecksEnabled: event.target.checked
                          }
                        : current
                    )
                  }
                />
                <span>Enable destructive checks</span>
              </label>
            </div>
            <label className="field">
              <span>Allowed exploit classes</span>
              <input
                value={policyClassInput}
                onChange={(event) => setPolicyClassInput(event.target.value)}
                placeholder="auth-safe, graphql-introspection"
              />
            </label>
            <div className="button-row">
              <button type="button" onClick={handleSavePolicy}>
                Save Policy
              </button>
            </div>
          </div>

          <div className="stack section-card">
            <div className="card-topline">
              <strong>Runner Management</strong>
              <span className="pill">{runners.length} runners</span>
            </div>
            <div className="inline-grid">
              <label className="field">
                <span>Runner name</span>
                <input
                  value={runnerForm.name}
                  onChange={(event) =>
                    setRunnerForm((current) => ({
                      ...current,
                      name: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Endpoint</span>
                <input
                  value={runnerForm.endpoint}
                  onChange={(event) =>
                    setRunnerForm((current) => ({
                      ...current,
                      endpoint: event.target.value
                    }))
                  }
                />
              </label>
            </div>
            {runners.filter((runner) => !runner.managed).map((runner) => (
              <div key={runner.id} className="button-row">
                <span className="runner-label">{runner.name}</span>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleSetRunnerStatus(runner.id, "busy")}
                >
                  Set Busy
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleSetRunnerStatus(runner.id, "ready")}
                >
                  Set Ready
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleDetachRunner(runner.id)}
                >
                  Detach
                </button>
              </div>
            ))}
          </div>

          <p className="status-note">{statusMessage}</p>
        </div>
      }
    />
  );
}
