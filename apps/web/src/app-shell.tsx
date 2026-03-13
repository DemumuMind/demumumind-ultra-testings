import type { WorkflowDetail, WorkflowSummary, WorkspaceSummary } from "@shannon/shared";
import type { ProviderResponse } from "./api.js";

interface AppShellState {
  authState: "connected" | "pending" | "disconnected";
  connectionEmail: string | null;
  providers: ProviderResponse[];
  workflows: WorkflowSummary[];
  workspaces: WorkspaceSummary[];
  selectedWorkflowId: string | null;
  workflowDetail: WorkflowDetail | null;
}

interface AppShellProps {
  state: AppShellState;
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function AppShell({ state }: AppShellProps) {
  const selectedWorkflow =
    state.workflowDetail?.workflow ??
    state.workflows.find((workflow) => workflow.id === state.selectedWorkflowId) ??
    state.workflows[0] ??
    null;

  return (
    <div className="workflow-page">
      <header className="workflow-hero">
        <div>
          <p className="eyebrow">Shannon-Style Runner</p>
          <h1>Workflow Dashboard</h1>
          <p className="hero-copy">
            CLI-first workflow monitoring for local AppSec runs, with compact run statistics,
            workspace history, and evidence-linked summaries.
          </p>
        </div>
        <div className="hero-meta">
          <div className="status-badge">
            <span className={`status-dot ${state.authState === "connected" ? "online" : "offline"}`} />
            <div>
              <p className="label">Operator</p>
              <strong>{state.connectionEmail ?? "local-cli-user"}</strong>
              <p className="muted">{state.authState}</p>
            </div>
          </div>
          <div className="provider-strip">
            {state.providers.map((provider) => (
              <div key={provider.kind} className="provider-chip">
                <strong>{provider.label}</strong>
                <span>{provider.status}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="workflow-grid">
        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workspaces</p>
              <h2>Recent Workspaces</h2>
            </div>
            <span className="pill">{state.workspaces.length}</span>
          </div>
          <div className="workspace-list">
            {state.workspaces.length === 0 ? (
              <p className="empty-copy">No workspaces recorded yet.</p>
            ) : (
              state.workspaces.map((workspace) => (
                <article key={workspace.id} className="workspace-card">
                  <div className="card-topline">
                    <strong>{workspace.name}</strong>
                    <span className="pill">{workspace.status}</span>
                  </div>
                  <p>{workspace.targetUrl}</p>
                  <p className="muted">{workspace.repoPath}</p>
                  <p className="muted">last workflow: {workspace.lastWorkflowId ?? "none"}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workflows</p>
              <h2>Run History</h2>
            </div>
            <span className="pill">{state.workflows.length}</span>
          </div>
          <div className="timeline">
            {state.workflows.length === 0 ? (
              <p className="empty-copy">No workflows available.</p>
            ) : (
              state.workflows.map((workflow) => (
                <article key={workflow.id} className="timeline-item">
                  <div className="card-topline">
                    <strong>{workflow.id}</strong>
                    <span className="pill">{workflow.status}</span>
                  </div>
                  <p>{workflow.workspace}</p>
                  <p className="muted">{workflow.targetUrl}</p>
                  <p className="muted">{formatDuration(workflow.durationMs)}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel panel-primary">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Selected Workflow</p>
              <h2>{selectedWorkflow?.id ?? "No workflow selected"}</h2>
            </div>
            {selectedWorkflow ? <span className="pill">{selectedWorkflow.status}</span> : null}
          </div>
          {selectedWorkflow ? (
            <div className="stats-grid">
              <article className="stat-card">
                <p className="label">Total Cost</p>
                <strong>{formatCurrency(selectedWorkflow.totalCostUsd)}</strong>
              </article>
              <article className="stat-card">
                <p className="label">Turns</p>
                <strong>{selectedWorkflow.totalTurns}</strong>
              </article>
              <article className="stat-card">
                <p className="label">Agents</p>
                <strong>{selectedWorkflow.agentCount}</strong>
              </article>
              <article className="stat-card">
                <p className="label">Duration</p>
                <strong>{formatDuration(selectedWorkflow.durationMs)}</strong>
              </article>
            </div>
          ) : (
            <p className="empty-copy">Run a workflow to populate the dashboard.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Agent Breakdown</p>
              <h2>Agent Breakdown</h2>
            </div>
          </div>
          <div className="timeline">
            {selectedWorkflow?.agentBreakdown.map((agent) => (
              <article key={agent.id} className="timeline-item">
                <div className="card-topline">
                  <strong>{agent.label}</strong>
                  <span className="pill">{agent.status}</span>
                </div>
                <p className="muted">
                  {formatDuration(agent.durationMs)} · {agent.turns} turns
                </p>
                <p>{formatCurrency(agent.costUsd)}</p>
              </article>
            )) ?? <p className="empty-copy">No agent data yet.</p>}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Result</p>
              <h2>Latest Findings</h2>
            </div>
          </div>
          <div className="timeline">
            {state.workflowDetail?.findings.length ? (
              state.workflowDetail.findings.map((finding) => (
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
              <p className="empty-copy">Confirmed findings will appear here after a run.</p>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2>Phase History</h2>
            </div>
          </div>
          <div className="timeline">
            {selectedWorkflow?.phaseHistory.map((phase) => (
              <article key={`${phase.phase}-${phase.changedAt}`} className="timeline-item">
                <div className="card-topline">
                  <strong>{phase.phase}</strong>
                  <span className="pill">{phase.changedAt}</span>
                </div>
              </article>
            )) ?? <p className="empty-copy">No phase history yet.</p>}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Logs</p>
              <h2>Workflow Logs</h2>
            </div>
          </div>
          <pre className="log-view">
            {state.workflowDetail?.logs.join("\n") ?? "Logs will appear here when a workflow is selected."}
          </pre>
        </section>
      </main>
    </div>
  );
}
