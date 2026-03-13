import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./app-shell.js";

describe("AppShell", () => {
  test("renders the major dashboard sections and recent findings", () => {
    const markup = renderToStaticMarkup(
      <AppShell
        state={{
          operatorId: "local-cli-user",
          connectionEmail: "analyst@example.com",
          doctorStatus: "ready",
          projects: [
            {
              id: "project-1",
              name: "Demo app",
              baseUrl: "http://localhost:3001",
              sourceRoots: ["C:/demo/source"],
              proofMode: "safe"
            }
          ],
          providers: [
            {
              kind: "openai",
              status: "configured"
            },
            {
              kind: "nvidia",
              status: "missing-key"
            }
          ],
          capabilities: [
            {
              id: "report-synthesis",
              category: "core",
              permissionLevel: "safe"
            }
          ],
          runners: [
            {
              id: "runner-1",
              mode: "local",
              status: "ready"
            }
          ],
          scans: [
            {
              id: "scan-1",
              status: "completed",
              projectId: "project-1",
              phaseHistory: [
                "project-intake",
                "environment-doctor",
                "source-indexing",
                "recon-surface",
                "static-reasoning",
                "dynamic-validation",
                "reporting",
                "completed"
              ]
            }
          ],
          latestReport: {
            report: {
              id: "report-1",
              scanRunId: "scan-1",
              findingIds: ["finding-1"],
              coverageMatrix: [
                {
                  id: "graphql-abuse",
                  title: "GraphQL abuse paths",
                  status: "supported",
                  proofType: "safe"
                }
              ],
              unsupportedClasses: ["mobile-thick-client"]
            },
            findings: [
              {
                id: "finding-1",
                attackDomain: "graphql",
                title: "GraphQL introspection exposed to anonymous users",
                proofOfImpact: "Simulation mode confirmed a reproducible injection signal",
                proofType: "safe"
              }
            ]
          },
          deviceLogin: {
            verificationUri: "https://auth.example.test/device",
            userCode: "ABCD-EFGH",
            sessionId: "device-session-1"
          }
        }}
      />
    );

    expect(markup).toContain("DemumuMind Ultra Testings");
    expect(markup).toContain("Desktop Shell");
    expect(markup).toContain("Windows ready");
    expect(markup).toContain("Demo app");
    expect(markup).toContain("GraphQL introspection exposed to anonymous users");
    expect(markup).toContain("ABCD-EFGH");
    expect(markup).toContain("report-synthesis");
    expect(markup).toContain("runner-1");
  });
});
