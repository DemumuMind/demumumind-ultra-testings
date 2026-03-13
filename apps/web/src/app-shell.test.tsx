import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  test("renders a workflow dashboard and details without the old control-plane sections", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        state={{
          authState: "connected",
          connectionEmail: "analyst@example.com",
          providers: [
            {
              kind: "openai",
              label: "OpenAI",
              status: "configured",
              authStrategies: ["browser-oauth", "device-auth", "manual"]
            },
            {
              kind: "nvidia",
              label: "NVIDIA",
              status: "missing-key",
              authStrategies: ["browser-oauth", "device-auth", "manual"]
            }
          ],
          workflows: [
            {
              id: "workflow-1",
              status: "completed",
              currentPhase: "completed",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app",
              workspace: "demo-workspace",
              reportPath: "./audit-logs/demo-workspace/report.json",
              durationMs: 13857072,
              totalCostUsd: 57.4691,
              totalTurns: 2093,
              agentCount: 11,
              startedAt: "2026-02-14T15:55:40.040Z",
              endedAt: "2026-02-14T19:46:37.160Z",
              phaseHistory: [
                {
                  phase: "queued",
                  changedAt: "2026-02-14T15:55:40.040Z"
                },
                {
                  phase: "completed",
                  changedAt: "2026-02-14T19:46:37.160Z"
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
              status: "completed",
              workflowCount: 1,
              lastWorkflowId: "workflow-1",
              lastRunAt: "2026-02-14T19:46:37.160Z",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app"
            }
          ],
          selectedWorkflowId: "workflow-1",
          workflowDetail: {
            workflow: {
              id: "workflow-1",
              status: "completed",
              currentPhase: "completed",
              targetUrl: "http://localhost:3001",
              repoPath: "C:/demo/repos/demo-app",
              workspace: "demo-workspace",
              reportPath: "./audit-logs/demo-workspace/report.json",
              durationMs: 13857072,
              totalCostUsd: 57.4691,
              totalTurns: 2093,
              agentCount: 11,
              startedAt: "2026-02-14T15:55:40.040Z",
              endedAt: "2026-02-14T19:46:37.160Z",
              phaseHistory: [
                {
                  phase: "queued",
                  changedAt: "2026-02-14T15:55:40.040Z"
                },
                {
                  phase: "completed",
                  changedAt: "2026-02-14T19:46:37.160Z"
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
              findingIds: ["finding-1"]
            },
            findings: [
              {
                id: "finding-1",
                attackDomain: "injection",
                title: "SQL injection sink exposed",
                proofOfImpact: "Confirmed read-only injection path",
                proofType: "safe"
              }
            ],
            logs: [
              "[2026-02-14 15:55:40] [workflow] Workflow created",
              "[2026-02-14 19:46:37] [workflow] Workflow completed"
            ]
          }
        }}
      />
    );

    expect(markup).toContain("Workflow Dashboard");
    expect(markup).toContain("demo-workspace");
    expect(markup).toContain("workflow-1");
    expect(markup).toContain("$57.4691");
    expect(markup).toContain("2093");
    expect(markup).toContain("SQL injection sink exposed");
    expect(markup).toContain("Workflow completed");
    expect(markup).toContain("OpenAI");
    expect(markup).toContain("NVIDIA");
    expect(markup).not.toContain("Project Policy");
    expect(markup).not.toContain("Runner Management");
    expect(markup).not.toContain("Capability Packs");
  });
});
