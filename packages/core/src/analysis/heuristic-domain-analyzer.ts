import { nanoid } from "nanoid";
import type { AttackDomain, AttackHypothesis, ReconArtifact, ScanRun } from "@shannon/shared";

export class HeuristicDomainAnalyzer {
  constructor(public readonly domain: AttackDomain) {}

  async analyze(input: {
    scanRun: ScanRun;
    reconArtifact: ReconArtifact;
  }): Promise<AttackHypothesis[]> {
    return input.reconArtifact.riskIndicators
      .filter((indicator) => indicator.domain === this.domain)
      .map((indicator) => ({
        id: nanoid(),
        scanRunId: input.scanRun.id,
        domain: this.domain,
        title: `${this.domain} hypothesis`,
        description: indicator.summary,
        evidence: [indicator.filePath, indicator.locationHint].filter(
          (value): value is string => Boolean(value)
        ),
        status: "ready-for-exploitation"
      }));
  }
}

