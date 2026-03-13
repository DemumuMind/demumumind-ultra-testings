import type { ReactNode } from "react";

interface DeviceLoginState {
  verificationUri: string;
  userCode: string;
  sessionId: string;
}

interface LatestReportState {
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
}

interface AppShellState {
  operatorId: string;
  connectionEmail: string | null;
  doctorStatus: string;
  projects: Array<{
    id: string;
    name: string;
    baseUrl: string;
    sourceRoots: string[];
    proofMode: string;
  }>;
  providers: Array<{
    kind: string;
    status: string;
  }>;
  capabilities: Array<{
    id: string;
    category: string;
    permissionLevel: string;
  }>;
  runners: Array<{
    id: string;
    mode: string;
    status: string;
  }>;
  scans: Array<{
    id: string;
    status: string;
    projectId: string;
    phaseHistory: string[];
  }>;
  latestReport: LatestReportState | null;
  deviceLogin: DeviceLoginState | null;
}

interface AppShellProps {
  state: AppShellState;
  controls?: ReactNode;
}

export function AppShell({ state, controls }: AppShellProps) {
  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Desktop Shell</p>
          <h1>DemumuMind Ultra Testings</h1>
          <p className="hero-copy">
            Windows-first AppSec control plane with local runner orchestration, slash-first CLI,
            safe proof validation, and evidence-linked reporting.
          </p>
        </div>
        <div className="status-tile">
          <span className={`status-dot ${state.connectionEmail ? "online" : "offline"}`} />
          <div>
            <p className="label">Operator</p>
            <strong>{state.operatorId}</strong>
            <p className="muted">{state.connectionEmail ? "Connected" : "Not connected"}</p>
            <p className="muted">
              {state.doctorStatus === "ready" ? "Windows ready" : "Needs environment fixes"}
            </p>
          </div>
        </div>
      </header>

      <main className="dashboard-grid">
        <section className="panel panel-primary">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Control plane</p>
              <h2>Onboarding and Scan Control</h2>
            </div>
            <span className="pill">{state.projects.length} projects</span>
          </div>
          {controls ?? (
            <div className="stack">
              <p className="muted">Interactive controls are injected by the client application.</p>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Providers</p>
              <h2>LLM Backends</h2>
            </div>
            <span className="pill">{state.providers.length}</span>
          </div>
          <div className="timeline">
            {state.providers.map((provider) => (
              <article key={provider.kind} className="timeline-item">
                <div className="card-topline">
                  <strong>{provider.kind}</strong>
                  <span className="pill">{provider.status}</span>
                </div>
              </article>
            ))}
            {state.deviceLogin ? (
              <div className="device-card">
                <p className="label">Device login</p>
                <strong>{state.deviceLogin.userCode}</strong>
                <a href={state.deviceLogin.verificationUri} target="_blank" rel="noreferrer">
                  {state.deviceLogin.verificationUri}
                </a>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Capabilities</p>
              <h2>Capability Packs</h2>
            </div>
          </div>
          <div className="timeline">
            {state.capabilities.map((capability) => (
              <article key={capability.id} className="timeline-item">
                <div className="card-topline">
                  <strong>{capability.id}</strong>
                  <span className="pill">{capability.permissionLevel}</span>
                </div>
                <p className="muted">{capability.category}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Projects</p>
              <h2>Registered Workspaces</h2>
            </div>
          </div>
          <div className="card-grid">
            {state.projects.length === 0 ? (
              <p className="muted">No projects registered yet.</p>
            ) : (
              state.projects.map((project) => (
                <article key={project.id} className="target-card">
                  <div className="card-topline">
                    <strong>{project.name}</strong>
                    <span className="pill">{project.proofMode}</span>
                  </div>
                  <p>{project.baseUrl}</p>
                  <p className="muted">{project.sourceRoots.join(", ")}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Runners</p>
              <h2>Local and Attached</h2>
            </div>
          </div>
          <div className="timeline">
            {state.runners.map((runner) => (
              <article key={runner.id} className="timeline-item">
                <div className="card-topline">
                  <strong>{runner.id}</strong>
                  <span className="pill">{runner.status}</span>
                </div>
                <p className="muted">{runner.mode}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Runs</p>
              <h2>Recent Scans</h2>
            </div>
          </div>
          <div className="timeline">
            {state.scans.length === 0 ? (
              <p className="muted">No scans have run yet.</p>
            ) : (
              state.scans.map((scan) => (
                <article key={scan.id} className="timeline-item">
                  <div className="card-topline">
                    <strong>{scan.id}</strong>
                    <span className="pill">{scan.status}</span>
                  </div>
                  <p className="muted">Project: {scan.projectId}</p>
                  <p>{scan.phaseHistory.join(" -> ")}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Evidence</p>
              <h2>Latest Findings</h2>
            </div>
            {state.latestReport ? <span className="pill">Report ready</span> : null}
          </div>
          <div className="timeline">
            {state.latestReport?.findings.length ? (
              state.latestReport.findings.map((finding) => (
                <article key={finding.id} className="finding-card">
                  <div className="card-topline">
                    <strong>{finding.title}</strong>
                    <span className="pill">{finding.attackDomain}</span>
                  </div>
                  <p>{finding.proofOfImpact}</p>
                  <p className="muted">proof: {finding.proofType}</p>
                </article>
              ))
            ) : (
              <p className="muted">Confirmed findings will appear here after a completed run.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Coverage</p>
              <h2>Coverage Matrix</h2>
            </div>
          </div>
          <div className="timeline">
            {state.latestReport?.report.coverageMatrix.length ? (
              state.latestReport.report.coverageMatrix.map((item) => (
                <article key={item.id} className="timeline-item">
                  <div className="card-topline">
                    <strong>{item.title}</strong>
                    <span className="pill">{item.status}</span>
                  </div>
                  <p className="muted">proof: {item.proofType}</p>
                </article>
              ))
            ) : (
              <p className="muted">Coverage transparency will appear after the first report.</p>
            )}
            {state.latestReport?.report.unsupportedClasses.length ? (
              <p className="muted">
                Unsupported: {state.latestReport.report.unsupportedClasses.join(", ")}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
