import { ScanOrchestrator } from "./scan-orchestrator.js";
import { InMemoryStateRepository } from "../storage/in-memory-state-repository.js";
import type { AttackDomain, ConfirmedFinding, ReconArtifact, ScanRun } from "@shannon/shared";

describe("ScanOrchestrator", () => {
  test("runs the full scan lifecycle and only reports successfully exploited findings", async () => {
    const stateRepository = new InMemoryStateRepository();
    const orchestrator = new ScanOrchestrator({
      stateRepository,
      reconService: {
        async runRecon(): Promise<ReconArtifact> {
          return {
            id: "recon-1",
            targetId: "target-1",
            discoveredEndpoints: ["/api/login", "/api/users/:id"],
            discoveredViews: ["/login"],
            authenticationSurface: ["password"],
            frameworkSignals: ["react", "express"],
            sourceHighlights: [
              {
                filePath: "src/routes/login.ts",
                summary: "String interpolation detected in query construction"
              }
            ],
            createdAt: "2026-03-13T12:00:00.000Z"
          };
        }
      },
      analyzers: [
        {
          domain: "injection",
          async analyze() {
            return [
              {
                id: "hyp-1",
                scanRunId: "scan-1",
                domain: "injection" as AttackDomain,
                title: "Potential SQL injection in login flow",
                description: "User input flows into a query string",
                evidence: ["src/routes/login.ts"],
                status: "ready-for-exploitation"
              }
            ];
          }
        },
        {
          domain: "authorization",
          async analyze() {
            return [
              {
                id: "hyp-2",
                scanRunId: "scan-1",
                domain: "authorization" as AttackDomain,
                title: "Potential IDOR on /api/users/:id",
                description: "Resource identifier is not checked against user scope",
                evidence: ["src/routes/users.ts"],
                status: "ready-for-exploitation"
              }
            ];
          }
        }
      ],
      exploiters: [
        {
          domain: "injection",
          async exploit(hypothesis) {
            return {
              id: "attempt-1",
              scanRunId: hypothesis.scanRunId,
              hypothesisId: hypothesis.id,
              domain: hypothesis.domain,
              status: "confirmed",
              proofOfConcept: "curl -X POST /api/login ...",
              impactSummary: "Authentication bypass reproduced",
              evidenceArtifacts: ["response.json"]
            };
          }
        },
        {
          domain: "authorization",
          async exploit(hypothesis) {
            return {
              id: "attempt-2",
              scanRunId: hypothesis.scanRunId,
              hypothesisId: hypothesis.id,
              domain: hypothesis.domain,
              status: "failed",
              proofOfConcept: null,
              impactSummary: "Could not reproduce",
              evidenceArtifacts: []
            };
          }
        }
      ]
    });

    const run = await orchestrator.enqueueScan({
      initiatedByUserId: "user-1",
      targetId: "target-1",
      sourceBundleId: "source-1"
    });

    await orchestrator.processNextRun();

    const persistedRun = (await stateRepository.list<ScanRun>("scanRuns"))[0];
    const findings = await stateRepository.list<ConfirmedFinding>("confirmedFindings");
    const reports = await stateRepository.list<{
      id: string;
      exploitPacks?: Array<{
        id: string;
        attackDomain: string;
        proofType: string;
      }>;
      coverageMatrix: Array<{
        id: string;
        proofType: string;
      }>;
    }>("reports");
    const report = reports[0];

    expect(run.status).toBe("queued");
    expect(persistedRun?.status).toBe("completed");
    expect(persistedRun?.phaseHistory.map((phase) => phase.phase)).toEqual([
      "queued",
      "project-intake",
      "environment-doctor",
      "source-indexing",
      "recon-surface",
      "static-reasoning",
      "dynamic-validation",
      "reporting",
      "completed"
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.attackDomain).toBe("injection");
    expect(findings[0]?.proofOfConcept).toContain("/api/login");
    expect(findings[0]?.proofType).toBe("safe");
    expect(report?.exploitPacks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "auth-safe-pack",
          attackDomain: "authentication",
          proofType: "safe"
        }),
        expect.objectContaining({
          id: "authorization-safe-pack",
          attackDomain: "authorization",
          proofType: "safe"
        }),
        expect.objectContaining({
          id: "graphql-safe-pack",
          attackDomain: "graphql",
          proofType: "safe"
        })
      ])
    );
    expect(report?.coverageMatrix).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "graphql-abuse",
          proofType: "safe"
        }),
        expect.objectContaining({
          id: "business-logic",
          proofType: "safe"
        })
      ])
    );
  });
});
