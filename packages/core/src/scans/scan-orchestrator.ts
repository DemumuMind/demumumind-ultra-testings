import { nanoid } from "nanoid";
import type {
  AttackDomain,
  AttackHypothesis,
  ConfirmedFinding,
  CoverageMatrixItem,
  ExploitPackSummary,
  ExploitAttempt,
  ReconArtifact,
  Report,
  ScanPhase,
  ScanRun
} from "@shannon/shared";
import type { StateRepository } from "../storage/state-repository.js";
import { SafeExploitPackRegistry } from "./safe-exploit-pack-registry.js";

interface ReconService {
  runRecon(input: {
    scanRun: ScanRun;
  }): Promise<ReconArtifact>;
}

interface Analyzer {
  domain: AttackDomain;
  analyze(input: {
    scanRun: ScanRun;
    reconArtifact: ReconArtifact;
  }): Promise<AttackHypothesis[]>;
}

interface Exploiter {
  domain: AttackDomain;
  exploit(hypothesis: AttackHypothesis): Promise<ExploitAttempt>;
}

interface ScanOrchestratorOptions {
  stateRepository: StateRepository;
  reconService: ReconService;
  analyzers: Analyzer[];
  exploiters: Exploiter[];
  now?: () => string;
}

export class ScanOrchestrator {
  private readonly now: () => string;
  private readonly exploitPacks: SafeExploitPackRegistry;

  constructor(private readonly options: ScanOrchestratorOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.exploitPacks = new SafeExploitPackRegistry();
  }

  async enqueueScan(input: {
    initiatedByUserId: string;
    targetId: string;
    sourceBundleId: string;
    projectId?: string;
  }): Promise<ScanRun> {
    const timestamp = this.now();
    const run: ScanRun = {
      id: nanoid(),
      initiatedByUserId: input.initiatedByUserId,
      targetId: input.targetId,
      projectId: input.projectId ?? null,
      sourceBundleId: input.sourceBundleId,
      status: "queued",
      phaseHistory: [
        {
          phase: "queued",
          changedAt: timestamp
        }
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
      reconArtifactId: null,
      reportId: null
    };

    await this.options.stateRepository.put("scanRuns", run);
    return run;
  }

  async processNextRun(): Promise<ScanRun | null> {
    const queuedRuns = await this.options.stateRepository.list<ScanRun>("scanRuns");
    const nextRun = queuedRuns.find((run) => run.status === "queued");

    if (!nextRun) {
      return null;
    }

    let persistedRun = await this.transition(nextRun, "project-intake");
    persistedRun = await this.transition(persistedRun, "environment-doctor");
    persistedRun = await this.transition(persistedRun, "source-indexing");
    persistedRun = await this.transition(persistedRun, "recon-surface");
    const reconArtifact = await this.options.reconService.runRecon({
      scanRun: persistedRun
    });
    await this.options.stateRepository.put("reconArtifacts", reconArtifact);
    persistedRun = await this.persistRun({
      ...persistedRun,
      reconArtifactId: reconArtifact.id
    });

    persistedRun = await this.transition(persistedRun, "static-reasoning");
    const hypotheses = (await Promise.all(
      this.options.analyzers.map((analyzer) =>
        analyzer.analyze({
          scanRun: persistedRun,
          reconArtifact
        })
      )
    )).flat();

    await Promise.all(
      hypotheses.map((hypothesis) => this.options.stateRepository.put("attackHypotheses", hypothesis))
    );

    persistedRun = await this.transition(persistedRun, "dynamic-validation");
    const attempts = (
      await Promise.all(
        hypotheses.map(async (hypothesis) => {
          const exploiter = this.options.exploiters.find(
            (candidate) => candidate.domain === hypothesis.domain
          );

          if (!exploiter) {
            return {
              id: nanoid(),
              scanRunId: hypothesis.scanRunId,
              hypothesisId: hypothesis.id,
              domain: hypothesis.domain,
              status: "failed",
              proofOfConcept: null,
              impactSummary: `No exploiter registered for ${hypothesis.domain}`,
              evidenceArtifacts: []
            } satisfies ExploitAttempt;
          }

          return exploiter.exploit(hypothesis);
        })
      )
    ).flat();

    await Promise.all(
      attempts.map((attempt) => this.options.stateRepository.put("exploitAttempts", attempt))
    );

    const findings = hypotheses.flatMap((hypothesis) => {
      const matchingAttempt = attempts.find((attempt) => attempt.hypothesisId === hypothesis.id);

      if (!matchingAttempt || matchingAttempt.status !== "confirmed" || !matchingAttempt.proofOfConcept) {
        return [];
      }

      const finding: ConfirmedFinding = {
        id: nanoid(),
        scanRunId: matchingAttempt.scanRunId,
        attackDomain: matchingAttempt.domain,
        severity: this.severityForDomain(matchingAttempt.domain),
        title: hypothesis.title,
        affectedSurface: hypothesis.evidence[0] ?? "unknown",
        codeLocation: hypothesis.evidence[0] ?? null,
        prerequisites: ["owned target", "valid scan authorization"],
        proofOfConcept: matchingAttempt.proofOfConcept,
        proofOfImpact: matchingAttempt.impactSummary,
        rawEvidence: matchingAttempt.evidenceArtifacts,
        reproductionStatus: "confirmed",
        lifecycleStage: "confirmed",
        confidence: this.confidenceForDomain(matchingAttempt.domain),
        proofType: this.proofTypeForDomain(matchingAttempt.domain),
        remediation: this.remediationForDomain(matchingAttempt.domain),
        unsupportedNotes: []
      };

      return [finding];
    });

    await Promise.all(
      findings.map((finding) => this.options.stateRepository.put("confirmedFindings", finding))
    );

    persistedRun = await this.transition(persistedRun, "reporting");
    const report: Report = {
      id: nanoid(),
      scanRunId: persistedRun.id,
      findingIds: findings.map((finding) => finding.id),
      generatedAt: this.now(),
      exploitPacks: this.buildExploitPackSummaries(),
      coverageMatrix: this.buildCoverageMatrix(),
      unsupportedClasses: ["mobile-thick-client", "native-binary", "network-perimeter"]
    };

    await this.options.stateRepository.put("reports", report);
    persistedRun = await this.persistRun({
      ...persistedRun,
      reportId: report.id
    });

    return this.transition(persistedRun, "completed");
  }

  private async transition(run: ScanRun, phase: Exclude<ScanPhase, "failed">): Promise<ScanRun> {
    return this.persistRun({
      ...run,
      status: phase,
      phaseHistory: [
        ...run.phaseHistory,
        {
          phase,
          changedAt: this.now()
        }
      ]
    });
  }

  private async persistRun(run: ScanRun): Promise<ScanRun> {
    const persisted: ScanRun = {
      ...run,
      updatedAt: this.now()
    };
    await this.options.stateRepository.put("scanRuns", persisted);
    return persisted;
  }

  private severityForDomain(domain: AttackDomain): ConfirmedFinding["severity"] {
    switch (domain) {
      case "injection":
      case "authentication":
        return "critical";
      case "authorization":
      case "ssrf":
      case "graphql":
        return "high";
      case "xss":
      case "business-logic":
        return "medium";
    }
  }

  private confidenceForDomain(domain: AttackDomain): number {
    switch (domain) {
      case "authentication":
      case "authorization":
      case "injection":
        return 0.92;
      case "graphql":
      case "ssrf":
        return 0.88;
      case "xss":
      case "business-logic":
        return 0.8;
    }
  }

  private remediationForDomain(domain: AttackDomain): string {
    switch (domain) {
      case "authentication":
        return "Harden authentication flows with rate limits, MFA-aware checks, and stronger verification.";
      case "authorization":
        return "Enforce ownership and role checks on every sensitive operation.";
      case "injection":
        return "Replace string interpolation with parameterized execution and strict input handling.";
      case "ssrf":
        return "Restrict outbound destinations and validate all user-controlled URLs.";
      case "xss":
        return "Sanitize and encode untrusted content before rendering it in the browser.";
      case "graphql":
        return "Disable risky introspection and enforce resolver-level authorization.";
      case "business-logic":
        return "Codify business invariants and validate multi-step flows server-side.";
    }
  }

  private proofTypeForDomain(domain: AttackDomain): ConfirmedFinding["proofType"] {
    return this.exploitPacks.forDomain(domain)?.proofType ?? "safe";
  }

  private buildCoverageMatrix(): CoverageMatrixItem[] {
    return this.exploitPacks.buildCoverageMatrix();
  }

  private buildExploitPackSummaries(): ExploitPackSummary[] {
    return this.exploitPacks.list();
  }
}
