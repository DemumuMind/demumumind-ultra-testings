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
  getCapabilities,
  getConnection,
  getDoctorReport,
  getProjects,
  getProviders,
  getReport,
  getRunners,
  getScans,
  initProject,
  pollDeviceLogin,
  runScan,
  startBrowserLogin,
  startDeviceLogin
} from "./api.js";

export function App() {
  const [userId, setUserId] = useState("local-cli-user");
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
  const [runners, setRunners] = useState<Array<{ id: string; mode: string; status: string }>>([]);
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
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [projectForm, setProjectForm] = useState({
    name: "Demo Workspace",
    baseUrl: "http://localhost:3001",
    projectRoot: "C:/demo/project",
    sourceRoot: "C:/demo/project/src"
  });

  const deferredScans = useDeferredValue(scans);

  const refreshDashboard = useEffectEvent(async () => {
    const [doctor, fetchedProjects, fetchedProviders, fetchedCapabilities, fetchedRunners, fetchedScans, connection] =
      await Promise.all([
        getDoctorReport(),
        getProjects(),
        getProviders(),
        getCapabilities(),
        getRunners(),
        getScans(),
        getConnection(userId)
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
    setConnectionEmail(connection?.profile.email ?? null);

    const latestCompleted = [...fetchedScans]
      .reverse()
      .find((scan) => scan.status === "completed");

    if (!latestCompleted) {
      setLatestReport(null);
      return;
    }

    try {
      setLatestReport(await getReport(latestCompleted.id));
    } catch {
      setLatestReport(null);
    }
  });

  useEffect(() => {
    startTransition(() => {
      void refreshDashboard();
    });
  }, [refreshDashboard]);

  async function handleBrowserStart() {
    const result = await startBrowserLogin(userId);
    window.open(result.authorizationUrl, "_blank", "noopener,noreferrer");
    setStatusMessage("Browser login started. Complete the flow in the new tab.");
  }

  async function handleDeviceStart() {
    const result = await startDeviceLogin(userId);
    setDeviceLogin(result);
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
      setStatusMessage(`Connected as ${result.connection.profile.email}`);
      return;
    }

    setStatusMessage("Device login is still pending.");
  }

  async function handleProjectSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await initProject({
      name: projectForm.name,
      baseUrl: projectForm.baseUrl,
      projectRoot: projectForm.projectRoot,
      sourceRoots: [projectForm.sourceRoot]
    });

    setStatusMessage(`Initialized ${result.project.name} at ${result.configPath}`);
    await refreshDashboard();
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
    const runner = await attachRunner();
    setStatusMessage(`Attached ${runner.id} (${runner.status})`);
    await refreshDashboard();
  }

  return (
    <AppShell
      state={{
        operatorId: userId,
        connectionEmail,
        doctorStatus,
        projects,
        providers,
        capabilities,
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
              <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
                Refresh
              </button>
            </div>
          </div>

          <p className="status-note">{statusMessage}</p>
        </div>
      }
    />
  );
}
