import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  test("renders a workflow dashboard and details without the old control-plane sections", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        state={{
          ccsStatus: {
            binaryReady: true,
            settingsPath: "C:/Users/demo/.ccs/codex.settings.json",
            profileConfigured: true,
            dashboardUrl: "http://localhost:3000",
            dashboardRunning: true,
            cliProxyRunning: true,
            callbackPort: 1455,
            callbackPortReady: true,
            localhostBindable: true,
            firewallStatus: "warn",
            recentLogs: ["[OK] Browser opened", "[..] Waiting for OAuth callback..."],
            recommendedFixes: [
              'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455'
            ],
            activeProcess: "running"
          },
          ccsActionPending: null,
          runtimeHealthy: true,
          runtimeStopping: false,
          pollingActive: true,
          launchDraft: {
            url: "http://localhost:3001",
            repo: "C:/demo/repos/demo-app",
            workspace: "demo-workspace",
            config: "C:/demo/configs/example-config.yaml",
            output: "C:/demo/audit-logs"
          },
          launchingWorkflow: false,
          launchError: null,
          stoppingWorkflowId: null,
          providers: [
            {
              kind: "openai",
              label: "OpenAI",
              status: "configured",
              authStrategies: ["ccs-codex", "manual"]
            },
            {
              kind: "nvidia",
              label: "NVIDIA",
              status: "missing-key",
              authStrategies: ["manual"]
            }
          ],
          workflows: [
            {
              id: "workflow-1",
              status: "running",
              currentPhase: "preflight",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app",
              workspace: "demo-workspace",
              reportPath:
                "C:/demo/audit-logs/demo-workspace/comprehensive_security_assessment_report.md",
              durationMs: 42000,
              totalCostUsd: 1.25,
              totalTurns: 12,
              agentCount: 13,
              startedAt: "2026-02-14T15:55:40.040Z",
              endedAt: null,
              phaseHistory: [
                {
                  phase: "preflight",
                  changedAt: "2026-02-14T15:55:40.040Z"
                }
              ],
              agentBreakdown: [
                {
                  id: "pre-recon",
                  label: "pre-recon",
                  status: "completed",
                  durationMs: 1615000,
                  turns: 355,
                  costUsd: 8.7091
                }
              ]
            }
          ],
          workspaces: [
            {
              id: "demo-workspace",
              name: "demo-workspace",
              status: "running",
              workflowCount: 1,
              lastWorkflowId: "workflow-1",
              lastRunAt: "2026-02-14T19:46:37.160Z",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app"
            }
          ],
          workspaceDetail: {
            workspace: {
              id: "demo-workspace",
              name: "demo-workspace",
              status: "running",
              workflowCount: 1,
              lastWorkflowId: "workflow-1",
              lastRunAt: "2026-02-14T19:46:37.160Z",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app"
            },
            workflowIds: ["workflow-1"],
            resumeAttempts: [
              {
                workflowId: "workflow-1",
                supersededWorkflowIds: [],
                checkpointHash: "abc123"
              }
            ],
            artifacts: [
              {
                kind: "session",
                label: "Session Metadata",
                path: "C:/demo/audit-logs/demo-workspace/session.json",
                exists: true
              },
              {
                kind: "workflow-log",
                label: "Workflow Log",
                path: "C:/demo/audit-logs/demo-workspace/workflow.log",
                exists: true
              },
              {
                kind: "final-report",
                label: "Final Report",
                path:
                  "C:/demo/audit-logs/demo-workspace/comprehensive_security_assessment_report.md",
                exists: true
              }
            ]
          },
          artifactPreviewLoading: false,
          artifactPreviewError: null,
          artifactPreview: {
            artifact: {
              kind: "session",
              label: "Session Metadata",
              path: "C:/demo/audit-logs/demo-workspace/session.json",
              exists: true
            },
            contentType: "application/json",
            content:
              '{\n  "session": {\n    "id": "demo-workspace",\n    "lastWorkflowId": "workflow-1"\n  }\n}',
            truncated: false
          },
          selectedWorkflowId: "workflow-1",
          selectedWorkspaceId: "demo-workspace",
          workflowProgress: {
            workflowId: "workflow-1",
            status: "running",
            currentPhase: "preflight",
            currentAgent: "pre-recon",
            completedAgents: [],
            failedAgent: null,
            error: null,
            startTime: 0,
            elapsedMs: 12000,
            agentMetrics: {},
            summary: null
          },
          workflowDetail: {
            workflow: {
              id: "workflow-1",
              status: "running",
              currentPhase: "preflight",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app",
              workspace: "demo-workspace",
              reportPath:
                "C:/demo/audit-logs/demo-workspace/comprehensive_security_assessment_report.md",
              durationMs: 42000,
              totalCostUsd: 1.25,
              totalTurns: 12,
              agentCount: 13,
              startedAt: "2026-02-14T15:55:40.040Z",
              endedAt: null,
              phaseHistory: [
                {
                  phase: "preflight",
                  changedAt: "2026-02-14T15:55:40.040Z"
                }
              ],
              agentBreakdown: [
                {
                  id: "pre-recon",
                  label: "pre-recon",
                  status: "completed",
                  durationMs: 1615000,
                  turns: 355,
                  costUsd: 8.7091
                }
              ]
            },
            report: {
              id: "report-1",
              scanRunId: "scan-1",
              findingIds: [],
              generatedAt: "2026-02-14T19:46:37.160Z",
              exploitPacks: [],
              coverageMatrix: [],
              unsupportedClasses: []
            },
            findings: [],
            logs: [
              "[2026-02-14 15:55:40] [workflow] Initialized workflow-1",
              "[2026-02-14 15:55:50] [phase] START preflight"
            ]
          }
        }}
        onRefresh={() => undefined}
        onStopRuntime={() => undefined}
        onConnectOpenAi={() => undefined}
        onStartCcsDashboard={() => undefined}
        onStopCcsDashboard={() => undefined}
        onLaunchDraftChange={() => undefined}
        onLaunchWorkflow={() => undefined}
        onResumeWorkspace={() => undefined}
        onPreviewArtifact={() => undefined}
        onDownloadArtifact={() => undefined}
        onSelectWorkflow={() => undefined}
        onStopWorkflow={() => undefined}
        onSelectWorkspace={() => undefined}
      />
    );

    expect(markup).toContain("Workflow Dashboard");
    expect(markup).toContain("demo-workspace");
    expect(markup).toContain("workflow-1");
    expect(markup).toContain("$1.2500");
    expect(markup).toContain("preflight");
    expect(markup).toContain("comprehensive_security_assessment_report.md");
    expect(markup).toContain("Only validated exploit findings appear here");
    expect(markup).toContain("Initialized workflow-1");
    expect(markup).toContain("Runtime Control");
    expect(markup).toContain("OpenAI via CCS");
    expect(markup).toContain("Connect OpenAI");
    expect(markup).toContain("Start CCS Dashboard");
    expect(markup).toContain("Stop CCS Dashboard");
    expect(markup).toContain("codex.settings.json");
    expect(markup).toContain("Waiting for OAuth callback");
    expect(markup).toContain("CCS OAuth");
    expect(markup).toContain("Launch Workflow");
    expect(markup).toContain("Target URL");
    expect(markup).toContain("Repository Path");
    expect(markup).toContain("Resume");
    expect(markup).toContain("Start workflow");
    expect(markup).toContain("Stop workflow");
    expect(markup).toContain("Workspace Detail");
    expect(markup).toContain("Artifact Preview");
    expect(markup).toContain("Search Preview");
    expect(markup).toContain("Matches");
    expect(markup).toContain("Previous Match");
    expect(markup).toContain("Next Match");
    expect(markup).toContain("All Artifacts");
    expect(markup).toContain("Logs Only");
    expect(markup).toContain("Reports Only");
    expect(markup).toContain("Session Metadata");
    expect(markup).toContain("workflow.log");
    expect(markup).toContain("abc123");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Download");
    expect(markup).toContain("application/json");
    expect(markup).toContain("healthy");
    expect(markup).toContain("Polling active");
    expect(markup).toContain("pre-recon");
    expect(markup).toContain("Stop runtime");
    expect(markup).toContain("Refresh");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("NVIDIA");
    expect(markup).not.toContain("Project Policy");
    expect(markup).not.toContain("Runner Management");
    expect(markup).not.toContain("Capability Packs");
  });
});
