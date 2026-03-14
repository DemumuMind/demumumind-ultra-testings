import { useEffect, useMemo, useRef, useState } from "react";
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
import type { ProviderResponse } from "./api.js";
import { buildArtifactPreviewSearchView } from "./artifact-preview-search.js";
import type { LaunchDraft } from "./workflow-launch.js";

interface AppShellState {
  ccsStatus: CcsStatus | null;
  ccsActionPending: "connect" | "start-dashboard" | "stop-dashboard" | null;
  runtimeHealthy: boolean;
  runtimeStopping: boolean;
  pollingActive: boolean;
  providers: ProviderResponse[];
  launchDraft: LaunchDraft;
  launchingWorkflow: boolean;
  launchError: string | null;
  stoppingWorkflowId: string | null;
  workflows: WorkflowSummary[];
  workspaces: WorkspaceSummary[];
  selectedWorkspaceId: string | null;
  workspaceDetail: WorkspaceDetail | null;
  artifactPreviewLoading: boolean;
  artifactPreviewError: string | null;
  artifactPreview: WorkspaceArtifactPreview | null;
  selectedWorkflowId: string | null;
  workflowProgress: PipelineProgress | null;
  workflowDetail: WorkflowDetail | null;
}

interface AppShellProps {
  state: AppShellState;
  onRefresh: () => void;
  onStopRuntime: () => void;
  onConnectOpenAi: () => void;
  onStartCcsDashboard: () => void;
  onStopCcsDashboard: () => void;
  onLaunchDraftChange: (field: keyof LaunchDraft, value: string) => void;
  onLaunchWorkflow: () => void;
  onResumeWorkspace: (workspace: WorkspaceSummary) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onPreviewArtifact: (workspaceId: string, artifactKind: WorkspaceArtifactKind) => void;
  onDownloadArtifact: (workspaceId: string, artifactKind: WorkspaceArtifactKind) => void;
  onSelectWorkflow: (workflowId: string) => void;
  onStopWorkflow: (workflowId: string) => void;
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

export function AppShell({
  state,
  onRefresh,
  onStopRuntime,
  onConnectOpenAi,
  onStartCcsDashboard,
  onStopCcsDashboard,
  onLaunchDraftChange,
  onLaunchWorkflow,
  onResumeWorkspace,
  onSelectWorkspace,
  onPreviewArtifact,
  onDownloadArtifact,
  onSelectWorkflow,
  onStopWorkflow
}: AppShellProps) {
  const [artifactSearchQuery, setArtifactSearchQuery] = useState("");
  const [artifactFilter, setArtifactFilter] = useState<"all" | "logs" | "reports">("all");
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const artifactMatchRefs = useRef<Record<number, HTMLElement | null>>({});
  const selectedWorkflow =
    state.workflowDetail?.workflow ??
    state.workflows.find((workflow) => workflow.id === state.selectedWorkflowId) ??
    state.workflows[0] ??
    null;
  const ccsStatusTone = state.ccsStatus?.profileConfigured ? "online" : "offline";
  const ccsSummary = state.ccsStatus?.profileConfigured
    ? "OpenAI via CCS is configured"
    : "OpenAI via CCS is not configured";
  const filteredArtifacts = useMemo(() => {
    const artifacts = state.workspaceDetail?.artifacts ?? [];

    switch (artifactFilter) {
      case "logs":
        return artifacts.filter((artifact) => artifact.kind === "workflow-log");
      case "reports":
        return artifacts.filter(
          (artifact) => artifact.kind === "report-json" || artifact.kind === "final-report"
        );
      default:
        return artifacts;
    }
  }, [artifactFilter, state.workspaceDetail?.artifacts]);
  const artifactSearchView = useMemo(
    () =>
      state.artifactPreview
        ? buildArtifactPreviewSearchView(state.artifactPreview, artifactSearchQuery)
        : null,
    [artifactSearchQuery, state.artifactPreview]
  );

  useEffect(() => {
    setArtifactSearchQuery("");
  }, [state.artifactPreview?.artifact.path]);

  useEffect(() => {
    setArtifactFilter("all");
  }, [state.workspaceDetail?.workspace.id]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [artifactSearchQuery, state.artifactPreview?.artifact.path]);

  useEffect(() => {
    if (!artifactSearchView || artifactSearchView.matchCount === 0) {
      return;
    }

    setActiveMatchIndex((current) => {
      if (current < artifactSearchView.matchCount) {
        return current;
      }

      return 0;
    });
  }, [artifactSearchView]);

  useEffect(() => {
    if (!artifactSearchView || artifactSearchView.matchCount === 0 || artifactSearchView.query.length === 0) {
      return;
    }

    artifactMatchRefs.current[activeMatchIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }, [activeMatchIndex, artifactSearchView]);

  return (
    <div className="workflow-page">
      <header className="workflow-hero">
        <div>
          <p className="eyebrow">Shannon-Style Runner</p>
          <h1>Workflow Dashboard</h1>
          <p className="hero-copy">
            CLI-first monitoring for the Temporal-backed Shannon runtime, with workspace history,
            live phase context, and audit artifact visibility.
          </p>
        </div>
        <div className="hero-meta">
          <div className="status-badge">
            <span className={`status-dot ${ccsStatusTone}`} />
            <div>
              <p className="label">OpenAI via CCS</p>
              <strong>{ccsSummary}</strong>
              <p className="muted">
                {state.ccsStatus?.settingsPath ?? "Run `ccs codex --auth --add` to create a CCS profile."}
              </p>
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
              <p className="eyebrow">Integration</p>
              <h2>OpenAI via CCS</h2>
            </div>
            <span className="pill">{state.ccsStatus?.activeProcess ?? "idle"}</span>
          </div>
          <div className="timeline">
            <article className="timeline-item">
              <div className="card-topline">
                <strong>Profile</strong>
                <span className={`pill ${state.ccsStatus?.profileConfigured ? "pill-ok" : "pill-danger"}`}>
                  {state.ccsStatus?.profileConfigured ? "configured" : "missing"}
                </span>
              </div>
              <p className="muted">{state.ccsStatus?.settingsPath ?? "No CCS profile detected yet."}</p>
              <div className="control-row">
                <button
                  type="button"
                  className="control-button"
                  onClick={onConnectOpenAi}
                  disabled={state.ccsActionPending === "connect"}
                >
                  {state.ccsActionPending === "connect" ? "Connecting..." : "Connect OpenAI"}
                </button>
                <button
                  type="button"
                  className="control-button"
                  onClick={onStartCcsDashboard}
                  disabled={state.ccsActionPending === "start-dashboard"}
                >
                  {state.ccsActionPending === "start-dashboard"
                    ? "Starting dashboard..."
                    : "Start CCS Dashboard"}
                </button>
                <button
                  type="button"
                  className="control-button control-button-danger"
                  onClick={onStopCcsDashboard}
                  disabled={state.ccsActionPending === "stop-dashboard"}
                >
                  {state.ccsActionPending === "stop-dashboard"
                    ? "Stopping dashboard..."
                    : "Stop CCS Dashboard"}
                </button>
              </div>
            </article>
            <article className="timeline-item">
              <div className="card-topline">
                <strong>Services</strong>
                <span className="pill">
                  {state.ccsStatus?.dashboardRunning ? "dashboard online" : "dashboard offline"}
                </span>
              </div>
              <p className="muted">dashboard: {state.ccsStatus?.dashboardUrl ?? "http://localhost:3000"}</p>
              <p className="muted">
                CLIProxy: {state.ccsStatus?.cliProxyRunning ? "reachable" : "offline"}
              </p>
              <p className="muted">
                callback port {state.ccsStatus?.callbackPort ?? 1455}:{" "}
                {state.ccsStatus?.callbackPortReady ? "ready" : "busy"}
              </p>
              <p className="muted">
                localhost binding: {state.ccsStatus?.localhostBindable ? "ready" : "blocked"}
              </p>
              <p className="muted">
                firewall: {state.ccsStatus?.firewallStatus ?? "unknown"}
              </p>
            </article>
            <article className="timeline-item">
              <div className="card-topline">
                <strong>Recent CCS Logs</strong>
                <span className="pill">{state.ccsStatus?.recentLogs.length ?? 0}</span>
              </div>
              {state.ccsStatus?.recentLogs.length ? (
                <pre className="log-view ccs-log-view">{state.ccsStatus.recentLogs.join("\n")}</pre>
              ) : (
                <p className="empty-copy">No CCS activity has been captured yet.</p>
              )}
            </article>
            <article className="timeline-item">
              <div className="card-topline">
                <strong>Recommended Fixes</strong>
                <span className="pill">{state.ccsStatus?.recommendedFixes.length ?? 0}</span>
              </div>
              {state.ccsStatus?.recommendedFixes.length ? (
                <div className="timeline">
                  {state.ccsStatus.recommendedFixes.map((fix) => (
                    <p key={fix} className="muted">
                      {fix}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">No immediate CCS remediation steps are required.</p>
              )}
            </article>
          </div>
        </section>

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
                  <div className="control-row">
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => onSelectWorkspace(workspace.id)}
                    >
                      Inspect
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => onResumeWorkspace(workspace)}
                    >
                      Resume
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel panel-wide">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Launcher</p>
              <h2>Launch Workflow</h2>
            </div>
            <span className="pill">{state.launchingWorkflow ? "starting" : "ready"}</span>
          </div>
          <div className="launch-grid">
            <label className="field">
              <span className="field-label">Target URL</span>
              <input
                value={state.launchDraft.url}
                onChange={(event) => onLaunchDraftChange("url", event.currentTarget.value)}
                placeholder="https://target.example"
              />
            </label>
            <label className="field">
              <span className="field-label">Repository Path</span>
              <input
                value={state.launchDraft.repo}
                onChange={(event) => onLaunchDraftChange("repo", event.currentTarget.value)}
                placeholder="C:/repos/demo-app"
              />
            </label>
            <label className="field">
              <span className="field-label">Workspace</span>
              <input
                value={state.launchDraft.workspace}
                onChange={(event) => onLaunchDraftChange("workspace", event.currentTarget.value)}
                placeholder="optional"
              />
            </label>
            <label className="field">
              <span className="field-label">Config Path</span>
              <input
                value={state.launchDraft.config}
                onChange={(event) => onLaunchDraftChange("config", event.currentTarget.value)}
                placeholder="optional"
              />
            </label>
            <label className="field">
              <span className="field-label">Output Path</span>
              <input
                value={state.launchDraft.output}
                onChange={(event) => onLaunchDraftChange("output", event.currentTarget.value)}
                placeholder="optional"
              />
            </label>
          </div>
          <div className="control-row">
            <button
              type="button"
              className="control-button"
              onClick={onLaunchWorkflow}
              disabled={state.launchingWorkflow}
            >
              {state.launchingWorkflow ? "Starting..." : "Start workflow"}
            </button>
          </div>
          {state.launchError ? <p className="error-copy">{state.launchError}</p> : null}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>Workspace Detail</h2>
            </div>
            {state.selectedWorkspaceId ? <span className="pill">{state.selectedWorkspaceId}</span> : null}
          </div>
          {state.workspaceDetail ? (
            <div className="timeline">
              <article className="timeline-item">
                <div className="card-topline">
                  <strong>Artifacts</strong>
                  <span className="pill">{filteredArtifacts.length}</span>
                </div>
                <div className="control-row artifact-filter-row">
                  <button
                    type="button"
                    className={`control-button ${artifactFilter === "all" ? "control-button-active" : ""}`}
                    onClick={() => setArtifactFilter("all")}
                  >
                    All Artifacts
                  </button>
                  <button
                    type="button"
                    className={`control-button ${artifactFilter === "logs" ? "control-button-active" : ""}`}
                    onClick={() => setArtifactFilter("logs")}
                  >
                    Logs Only
                  </button>
                  <button
                    type="button"
                    className={`control-button ${artifactFilter === "reports" ? "control-button-active" : ""}`}
                    onClick={() => setArtifactFilter("reports")}
                  >
                    Reports Only
                  </button>
                </div>
                {filteredArtifacts.length === 0 ? (
                  <p className="empty-copy">No audit artifacts recorded yet.</p>
                ) : (
                  filteredArtifacts.map((artifact) => (
                    <div key={`${artifact.kind}-${artifact.path}`} className="timeline-item">
                      <div className="card-topline">
                        <strong>{artifact.label}</strong>
                        <span className={`pill ${artifact.exists ? "pill-ok" : "pill-danger"}`}>
                          {artifact.exists ? "ready" : "missing"}
                        </span>
                      </div>
                      <p className="muted">{artifact.path}</p>
                      <div className="control-row">
                        <button
                          type="button"
                          className="control-button"
                          onClick={() =>
                            state.selectedWorkspaceId
                              ? onPreviewArtifact(state.selectedWorkspaceId, artifact.kind)
                              : undefined
                          }
                          disabled={!artifact.exists || !state.selectedWorkspaceId}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className="control-button"
                          onClick={() =>
                            state.selectedWorkspaceId
                              ? onDownloadArtifact(state.selectedWorkspaceId, artifact.kind)
                              : undefined
                          }
                          disabled={!artifact.exists || !state.selectedWorkspaceId}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </article>
              <article className="timeline-item">
                <div className="card-topline">
                  <strong>Resume Attempts</strong>
                  <span className="pill">{state.workspaceDetail.resumeAttempts.length}</span>
                </div>
                {state.workspaceDetail.resumeAttempts.length === 0 ? (
                  <p className="empty-copy">No resume attempts recorded yet.</p>
                ) : (
                  state.workspaceDetail.resumeAttempts.map((attempt) => (
                    <div
                      key={`${attempt.workflowId}-${attempt.checkpointHash}`}
                      className="timeline-item"
                    >
                      <div className="card-topline">
                        <strong>{attempt.workflowId}</strong>
                        <span className="pill">{attempt.checkpointHash}</span>
                      </div>
                      <p className="muted">
                        superseded:{" "}
                        {attempt.supersededWorkflowIds.length > 0
                          ? attempt.supersededWorkflowIds.join(", ")
                          : "none"}
                      </p>
                    </div>
                  ))
                )}
              </article>
            </div>
          ) : (
            <p className="empty-copy">Select a workspace to inspect its audit artifacts.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Artifacts</p>
              <h2>Artifact Preview</h2>
            </div>
            {state.artifactPreview ? <span className="pill">{state.artifactPreview.contentType}</span> : null}
          </div>
          {state.artifactPreviewLoading ? (
            <p className="empty-copy">Loading artifact preview...</p>
          ) : state.artifactPreviewError ? (
            <p className="error-copy">{state.artifactPreviewError}</p>
          ) : state.artifactPreview ? (
            <>
              <p className="muted">
                {state.artifactPreview.artifact.label} · {state.artifactPreview.artifact.path}
              </p>
              <div className="preview-toolbar">
                <label className="field preview-search">
                  <span className="field-label">Search Preview</span>
                  <input
                    value={artifactSearchQuery}
                    onChange={(event) => setArtifactSearchQuery(event.currentTarget.value)}
                    placeholder="Search logs or reports"
                  />
                </label>
                <div className="preview-summary">
                  <p className="label">Matches</p>
                  <strong>{artifactSearchView?.matchCount ?? 0}</strong>
                </div>
                <div className="control-row preview-nav">
                  <button
                    type="button"
                    className="control-button"
                    onClick={() =>
                      setActiveMatchIndex((current) =>
                        artifactSearchView && artifactSearchView.matchCount > 0
                          ? (current - 1 + artifactSearchView.matchCount) % artifactSearchView.matchCount
                          : current
                      )
                    }
                    disabled={!artifactSearchView || artifactSearchView.matchCount === 0}
                  >
                    Previous Match
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    onClick={() =>
                      setActiveMatchIndex((current) =>
                        artifactSearchView && artifactSearchView.matchCount > 0
                          ? (current + 1) % artifactSearchView.matchCount
                          : current
                      )
                    }
                    disabled={!artifactSearchView || artifactSearchView.matchCount === 0}
                  >
                    Next Match
                  </button>
                </div>
              </div>
              {state.artifactPreview.truncated ? (
                <p className="muted">Preview truncated to keep the dashboard responsive.</p>
              ) : null}
              {artifactSearchView && artifactSearchView.query.length > 0 && artifactSearchView.matchCount === 0 ? (
                <p className="empty-copy">No matches in this artifact preview.</p>
              ) : null}
              <pre className="log-view artifact-preview">
                {artifactSearchView?.segments.map((segment, index) =>
                  segment.match ? (
                    <mark
                      key={`${index}-${segment.text.length}`}
                      className={`artifact-match ${segment.matchIndex === activeMatchIndex ? "artifact-match-active" : ""}`}
                      ref={(element) => {
                        if (typeof segment.matchIndex === "number") {
                          artifactMatchRefs.current[segment.matchIndex] = element;
                        }
                      }}
                    >
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={`${index}-${segment.text.length}`}>{segment.text}</span>
                  )
                ) ?? state.artifactPreview.content}
              </pre>
            </>
          ) : (
            <p className="empty-copy">Choose an artifact to preview its contents inline.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>Runtime Control</h2>
            </div>
            <span className={`pill ${state.runtimeHealthy ? "pill-ok" : "pill-danger"}`}>
              {state.runtimeHealthy ? "healthy" : "offline"}
            </span>
          </div>
          <div className="timeline">
            <article className="timeline-item">
              <div className="card-topline">
                <strong>Polling</strong>
                <span className="pill">{state.pollingActive ? "Polling active" : "Polling idle"}</span>
              </div>
              <p className="muted">
                {state.workflowProgress?.currentAgent
                  ? `current agent: ${state.workflowProgress.currentAgent}`
                  : "no active agent"}
              </p>
              <div className="control-row">
                <button type="button" className="control-button" onClick={onRefresh}>
                  Refresh
                </button>
                <button
                  type="button"
                  className="control-button control-button-danger"
                  onClick={onStopRuntime}
                  disabled={state.runtimeStopping}
                >
                  {state.runtimeStopping ? "Stopping..." : "Stop runtime"}
                </button>
              </div>
            </article>
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
                  <div className="control-row">
                    <button
                      type="button"
                      className="control-button"
                      onClick={() => onSelectWorkflow(workflow.id)}
                    >
                      View
                    </button>
                  </div>
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
            <>
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
              <div className="timeline">
                <article className="timeline-item">
                  <div className="card-topline">
                    <strong>Current Phase</strong>
                    <span className="pill">{selectedWorkflow.currentPhase}</span>
                  </div>
                  <p className="muted">Audit report</p>
                  <p>{selectedWorkflow.reportPath}</p>
                  <div className="control-row">
                    <button
                      type="button"
                      className="control-button control-button-danger"
                      onClick={() => onStopWorkflow(selectedWorkflow.id)}
                      disabled={
                        selectedWorkflow.status !== "running" ||
                        state.stoppingWorkflowId === selectedWorkflow.id
                      }
                    >
                      {state.stoppingWorkflowId === selectedWorkflow.id
                        ? "Stopping workflow..."
                        : "Stop workflow"}
                    </button>
                  </div>
                </article>
              </div>
            </>
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
              <p className="empty-copy">Only validated exploit findings appear here after a run.</p>
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
