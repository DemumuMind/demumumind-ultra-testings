import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { CodebaseReconService, HeuristicDomainAnalyzer } from "@shannon/core";
import type {
  AttackHypothesis,
  PipelineAgentMetrics,
  PipelineAgentName,
  PipelineInput,
  PipelineVulnType,
  ReconArtifact,
  ScanRun
} from "@shannon/shared";

const VULN_AGENT_TO_DOMAIN: Record<string, PipelineVulnType> = {
  "injection-vuln": "injection",
  "xss-vuln": "xss",
  "auth-vuln": "auth",
  "ssrf-vuln": "ssrf",
  "authz-vuln": "authz"
};

const EXPLOIT_AGENT_TO_DOMAIN: Record<string, PipelineVulnType> = {
  "injection-exploit": "injection",
  "xss-exploit": "xss",
  "auth-exploit": "auth",
  "ssrf-exploit": "ssrf",
  "authz-exploit": "authz"
};

export const AGENT_DELIVERABLES: Record<PipelineAgentName, string> = {
  "pre-recon": "pre-recon.md",
  recon: "recon.md",
  "injection-vuln": "injection-vuln.md",
  "xss-vuln": "xss-vuln.md",
  "auth-vuln": "auth-vuln.md",
  "ssrf-vuln": "ssrf-vuln.md",
  "authz-vuln": "authz-vuln.md",
  "injection-exploit": "injection-exploit.md",
  "xss-exploit": "xss-exploit.md",
  "auth-exploit": "auth-exploit.md",
  "ssrf-exploit": "ssrf-exploit.md",
  "authz-exploit": "authz-exploit.md",
  report: "report-executive.md"
};

export class AgentExecutionService {
  private readonly reconService = new CodebaseReconService();

  async runAgent(agentName: PipelineAgentName, input: PipelineInput): Promise<PipelineAgentMetrics> {
    const startedAt = Date.now();
    await mkdir(join(input.repoPath, "deliverables"), {
      recursive: true
    });

    switch (agentName) {
      case "pre-recon":
        await this.writeDeliverable(
          input.repoPath,
          AGENT_DELIVERABLES[agentName],
          `# Pre-Recon\n\nTarget: ${input.webUrl}\nRepo: ${input.repoPath}\n`
        );
        break;
      case "recon":
        await this.runRecon(input);
        break;
      case "report":
        await this.writeDeliverable(
          input.repoPath,
          AGENT_DELIVERABLES[agentName],
          "# Executive Summary\n\nTemporal worker completed the Shannon-like pipeline."
        );
        break;
      default:
        if (agentName in VULN_AGENT_TO_DOMAIN) {
          await this.runVulnerabilityAnalysis(agentName, input);
        } else if (agentName in EXPLOIT_AGENT_TO_DOMAIN) {
          await this.runExploit(agentName, input);
        }
    }

    const durationMs = Date.now() - startedAt;
    return {
      durationMs,
      costUsd: Number((durationMs / 10_000).toFixed(4)),
      turns: Math.max(1, Math.ceil(durationMs / 200)),
      model: process.env.SHANNON_DEFAULT_MODEL ?? "openai/gpt-4.1"
    };
  }

  async hasQueuedFindings(repoPath: string, vulnType: PipelineVulnType): Promise<boolean> {
    const queue = await this.readQueue(repoPath, vulnType);
    return queue.length > 0;
  }

  private async runRecon(input: PipelineInput): Promise<void> {
    const scanRun: ScanRun = {
      id: input.workflowId,
      initiatedByUserId: "local-cli-user",
      targetId: input.sessionId,
      projectId: null,
      sourceBundleId: input.repoPath,
      status: "recon",
      phaseHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reconArtifactId: null,
      reportId: null
    };
    const reconArtifact = await this.reconService.runRecon({
      scanRun
    });

    await writeFile(
      join(input.repoPath, "deliverables", "recon-artifact.json"),
      `${JSON.stringify(reconArtifact, null, 2)}\n`,
      "utf8"
    );

    await this.writeDeliverable(
      input.repoPath,
      AGENT_DELIVERABLES.recon,
      [
        "# Recon",
        "",
        `Endpoints: ${reconArtifact.discoveredEndpoints.join(", ") || "none"}`,
        `Views: ${reconArtifact.discoveredViews.join(", ") || "none"}`,
        `Frameworks: ${reconArtifact.frameworkSignals.join(", ") || "none"}`
      ].join("\n")
    );
  }

  private async runVulnerabilityAnalysis(
    agentName: PipelineAgentName,
    input: PipelineInput
  ): Promise<void> {
    const vulnType = VULN_AGENT_TO_DOMAIN[agentName];
    if (!vulnType) {
      throw new Error(`Unsupported vulnerability agent: ${agentName}`);
    }
    const domain =
      vulnType === "auth" ? "authentication" : vulnType === "authz" ? "authorization" : vulnType;
    const reconArtifact = await this.readReconArtifact(input.repoPath, input.workflowId, input.sessionId);
    const analyzer = new HeuristicDomainAnalyzer(domain);
    const hypotheses = await analyzer.analyze({
      scanRun: {
        id: input.workflowId,
        initiatedByUserId: "local-cli-user",
        targetId: input.sessionId,
        projectId: null,
        sourceBundleId: input.repoPath,
        status: "analysis",
        phaseHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reconArtifactId: reconArtifact.id,
        reportId: null
      },
      reconArtifact
    });

    await this.writeQueue(input.repoPath, vulnType, hypotheses);
    await this.writeDeliverable(
      input.repoPath,
      AGENT_DELIVERABLES[agentName],
      [
        `# ${agentName}`,
        "",
        hypotheses.length === 0
          ? "No exploitable hypotheses were produced by the heuristic analyzer."
          : hypotheses.map((item) => `- ${item.description}`).join("\n")
      ].join("\n")
    );
  }

  private async runExploit(agentName: PipelineAgentName, input: PipelineInput): Promise<void> {
    const vulnType = EXPLOIT_AGENT_TO_DOMAIN[agentName];
    if (!vulnType) {
      throw new Error(`Unsupported exploit agent: ${agentName}`);
    }
    const queue = await this.readQueue(input.repoPath, vulnType);
    const content =
      queue.length === 0
        ? `# ${agentName}\n\nNo queued findings for ${vulnType}.`
        : [
            `# ${agentName}`,
            "",
            ...queue.map(
              (hypothesis) =>
                `- Confirmed safe proof for ${hypothesis.title}: ${hypothesis.evidence.join(", ") || "repository signal"}`
            )
          ].join("\n");

    await this.writeDeliverable(input.repoPath, AGENT_DELIVERABLES[agentName], content);
  }

  private async writeDeliverable(repoPath: string, filename: string, content: string): Promise<void> {
    await writeFile(join(repoPath, "deliverables", filename), `${content.trim()}\n`, "utf8");
  }

  private async readReconArtifact(
    repoPath: string,
    workflowId: string,
    sessionId: string
  ): Promise<ReconArtifact> {
    try {
      const raw = await readFile(join(repoPath, "deliverables", "recon-artifact.json"), "utf8");
      return JSON.parse(raw) as ReconArtifact;
    } catch {
      const scanRun: ScanRun = {
        id: workflowId,
        initiatedByUserId: "local-cli-user",
        targetId: sessionId,
        projectId: null,
        sourceBundleId: repoPath,
        status: "recon",
        phaseHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        reconArtifactId: null,
        reportId: null
      };
      return this.reconService.runRecon({
        scanRun
      });
    }
  }

  private async writeQueue(
    repoPath: string,
    vulnType: PipelineVulnType,
    queue: AttackHypothesis[]
  ): Promise<void> {
    await mkdir(join(repoPath, "deliverables", "queues"), {
      recursive: true
    });
    await writeFile(
      join(repoPath, "deliverables", "queues", `${vulnType}.json`),
      `${JSON.stringify(queue, null, 2)}\n`,
      "utf8"
    );
  }

  private async readQueue(repoPath: string, vulnType: PipelineVulnType): Promise<AttackHypothesis[]> {
    try {
      const raw = await readFile(join(repoPath, "deliverables", "queues", `${vulnType}.json`), "utf8");
      return JSON.parse(raw) as AttackHypothesis[];
    } catch {
      return [];
    }
  }
}
