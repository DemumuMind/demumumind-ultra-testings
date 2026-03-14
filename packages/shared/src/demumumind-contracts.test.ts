import {
  ccsStatusSchema,
  confirmedFindingSchema,
  providerDefinitionSchema,
  providerHealthSchema,
  projectConfigSchema,
  reportSchema,
  workspaceArtifactPreviewSchema,
  workflowDetailSchema,
  workflowSummarySchema
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

  test("parses a Shannon-style workflow summary for dashboard statistics", () => {
    const workflow = workflowSummarySchema.parse({
      id: "workflow-1",
      scanRunId: "scan-1",
      reportId: "report-1",
      status: "completed",
      currentPhase: "completed",
      targetUrl: "http://localhost:3001",
      repoPath: "C:/demo/repos/demo-app",
      workspace: "demo-workspace",
      reportPath: "./audit-logs/demo-workspace/report.json",
      startedAt: "2026-02-14T15:55:40.040Z",
      endedAt: "2026-02-14T19:46:37.160Z",
      durationMs: 13857072,
      totalCostUsd: 57.4691,
      totalTurns: 2093,
      agentCount: 11,
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
    });

    expect(workflow.workspace).toBe("demo-workspace");
    expect(workflow.agentCount).toBe(11);
    expect(workflow.agentBreakdown[0]?.label).toBe("pre-recon");
  });

  test("parses workflow details and provider metadata restricted to OpenAI and NVIDIA", () => {
    const detail = workflowDetailSchema.parse({
      workflow: {
        id: "workflow-1",
        scanRunId: "scan-1",
        reportId: "report-1",
        status: "completed",
        currentPhase: "completed",
        targetUrl: "http://localhost:3001",
        repoPath: "C:/demo/repos/demo-app",
        workspace: "demo-workspace",
        reportPath: "./audit-logs/demo-workspace/report.json",
        startedAt: "2026-02-14T15:55:40.040Z",
        endedAt: "2026-02-14T19:46:37.160Z",
        durationMs: 13857072,
        totalCostUsd: 57.4691,
        totalTurns: 2093,
        agentCount: 11,
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
            id: "report",
            label: "report",
            status: "completed",
            durationMs: 771366,
            turns: 42,
            costUsd: 2.6514
          }
        ]
      },
      report: {
        id: "report-1",
        scanRunId: "scan-1",
        findingIds: ["finding-1"],
        generatedAt: "2026-02-14T19:46:37.160Z",
        exploitPacks: [],
        coverageMatrix: [],
        unsupportedClasses: []
      },
      findings: [],
      logs: ["[2026-02-14 19:46:37] [workflow] Workflow completed"]
    });

    const provider = providerHealthSchema.parse({
      kind: "openai",
      label: "OpenAI",
      envKey: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      status: "configured",
      authStrategies: ["ccs-codex", "manual"]
    });

    expect(detail.logs[0]).toContain("Workflow completed");
    expect(provider.kind).toBe("openai");
    expect(provider.authStrategies[0]).toBe("ccs-codex");
  });

  test("defaults provider auth strategies to CCS Codex plus manual env vars", () => {
    const provider = providerDefinitionSchema.parse({
      kind: "openai",
      label: "OpenAI",
      envKey: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1"
    });

    expect(provider.authStrategies).toEqual(["ccs-codex", "manual"]);
  });

  test("parses workspace artifact preview payloads for audit inspection", () => {
    const preview = workspaceArtifactPreviewSchema.parse({
      artifact: {
        kind: "session",
        label: "Session Metadata",
        path: "C:/demo/audit-logs/demo-workspace/session.json",
        exists: true
      },
      contentType: "application/json",
      content: "{\n  \"session\": {\n    \"id\": \"demo-workspace\"\n  }\n}",
      truncated: false
    });

    expect(preview.artifact.kind).toBe("session");
    expect(preview.contentType).toBe("application/json");
    expect(preview.content).toContain("demo-workspace");
  });

  test("parses CCS status payloads used by CLI, server, and web", () => {
    const status = ccsStatusSchema.parse({
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
      recentLogs: ["[OK] Browser opened"],
      recommendedFixes: [
        'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455'
      ],
      activeProcess: "running"
    });

    expect(status.profileConfigured).toBe(true);
    expect(status.firewallStatus).toBe("warn");
    expect(status.activeProcess).toBe("running");
  });
});
