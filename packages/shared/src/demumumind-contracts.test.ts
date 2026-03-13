import {
  confirmedFindingSchema,
  projectConfigSchema,
  reportSchema
} from "./index.js";

describe("DemumuMind shared contracts", () => {
  test("parses a Windows-first project config with explicit proof policy", () => {
    const parsed = projectConfigSchema.parse({
      id: "project-1",
      name: "Demo Workspace",
      projectRoot: "C:/work/demo",
      sourceRoots: ["C:/work/demo/src", "C:/work/demo/services"],
      target: {
        kind: "web-app",
        baseUrl: "http://localhost:3001"
      },
      auth: {
        strategy: "browser-oauth",
        loginHints: ["Use the seeded analyst account"]
      },
      scanProfile: "white-box-web-api",
      proofMode: "safe",
      providerPreferences: ["openai", "nvidia"],
      policy: {
        activeValidationAllowed: true,
        destructiveChecksEnabled: false,
        allowedExploitClasses: ["auth-safe", "read-only-http"]
      },
      createdAt: "2026-03-13T10:00:00.000Z",
      updatedAt: "2026-03-13T10:00:00.000Z"
    });

    expect(parsed.target.kind).toBe("web-app");
    expect(parsed.policy.destructiveChecksEnabled).toBe(false);
    expect(parsed.providerPreferences).toEqual(["openai", "nvidia"]);
  });

  test("parses a correlated report with safe-proof findings and transparent coverage", () => {
    const finding = confirmedFindingSchema.parse({
      id: "finding-1",
      scanRunId: "scan-1",
      attackDomain: "graphql",
      severity: "high",
      title: "GraphQL introspection exposed to anonymous users",
      affectedSurface: "/graphql",
      codeLocation: "src/graphql/server.ts:42",
      prerequisites: ["owned target"],
      proofOfConcept: "POST /graphql { __schema { queryType { name } } }",
      proofOfImpact: "Anonymous schema enumeration was reproduced safely",
      rawEvidence: ["logs/graphql-introspection.json"],
      reproductionStatus: "confirmed",
      lifecycleStage: "confirmed",
      confidence: 0.92,
      proofType: "safe",
      remediation: "Disable introspection outside trusted environments."
    });

    const report = reportSchema.parse({
      id: "report-1",
      scanRunId: "scan-1",
      findingIds: [finding.id],
      generatedAt: "2026-03-13T11:00:00.000Z",
      exploitPacks: [
        {
          id: "graphql-safe-pack",
          title: "GraphQL Safe Pack",
          attackDomain: "graphql",
          proofType: "safe",
          permissionLevel: "safe"
        }
      ],
      coverageMatrix: [
        {
          id: "graphql-abuse",
          title: "GraphQL abuse paths",
          status: "supported",
          proofType: "safe"
        },
        {
          id: "business-logic",
          title: "Business logic invariants",
          status: "partial",
          proofType: "safe"
        }
      ],
      unsupportedClasses: ["mobile-thick-client"]
    });

    expect(finding.proofType).toBe("safe");
    expect(report.exploitPacks[0]?.id).toBe("graphql-safe-pack");
    expect(report.coverageMatrix).toHaveLength(2);
    expect(report.unsupportedClasses).toContain("mobile-thick-client");
  });
});
