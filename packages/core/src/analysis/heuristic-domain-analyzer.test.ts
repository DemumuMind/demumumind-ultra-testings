import { HeuristicDomainAnalyzer } from "./heuristic-domain-analyzer.js";

describe("HeuristicDomainAnalyzer", () => {
  test("turns matching recon risk indicators into attack hypotheses for its domain", async () => {
    const analyzer = new HeuristicDomainAnalyzer("authorization");
    const hypotheses = await analyzer.analyze({
      scanRun: {
        id: "scan-1",
        initiatedByUserId: "user-1",
        targetId: "target-1",
        sourceBundleId: "source-1",
        status: "analysis",
        phaseHistory: [],
        createdAt: "2026-03-13T12:00:00.000Z",
        updatedAt: "2026-03-13T12:00:00.000Z",
        reconArtifactId: null,
        reportId: null
      },
      reconArtifact: {
        id: "recon-1",
        targetId: "target-1",
        discoveredEndpoints: ["/api/users/:id"],
        discoveredViews: [],
        authenticationSurface: [],
        frameworkSignals: ["fastify"],
        sourceHighlights: [],
        riskIndicators: [
          {
            domain: "authorization",
            filePath: "src/routes/users.ts",
            summary: "Route parameter used before any ownership check",
            locationHint: "/api/users/:id"
          }
        ],
        createdAt: "2026-03-13T12:00:00.000Z"
      }
    });

    expect(hypotheses).toEqual([
      expect.objectContaining({
        domain: "authorization",
        title: expect.stringContaining("authorization"),
        evidence: ["src/routes/users.ts", "/api/users/:id"]
      })
    ]);
  });
});
