import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { ReconArtifact, RiskIndicator, ScanRun } from "@shannon/shared";

interface ReconServiceInput {
  scanRun: ScanRun;
}

export class CodebaseReconService {
  async runRecon(input: ReconServiceInput): Promise<ReconArtifact> {
    const sourceFiles = await this.collectFiles(input.scanRun.sourceBundleId);
    const discoveredEndpoints = new Set<string>();
    const discoveredViews = new Set<string>();
    const frameworkSignals = new Set<string>();
    const riskIndicators: RiskIndicator[] = [];

    for (const filePath of sourceFiles) {
      const content = await readFile(filePath, "utf8");
      this.collectFrameworkSignals(content, frameworkSignals);
      this.collectEndpoints(content, discoveredEndpoints);
      this.collectViews(filePath, content, discoveredViews);
      riskIndicators.push(...this.collectRiskIndicators(filePath, content));
    }

    return {
      id: nanoid(),
      targetId: input.scanRun.targetId,
      discoveredEndpoints: [...discoveredEndpoints].sort(),
      discoveredViews: [...discoveredViews].sort(),
      authenticationSurface: this.collectAuthenticationSurface(riskIndicators),
      frameworkSignals: [...frameworkSignals].sort(),
      sourceHighlights: riskIndicators.map((indicator) => ({
        filePath: indicator.filePath,
        summary: indicator.summary
      })),
      riskIndicators,
      createdAt: new Date().toISOString()
    };
  }

  private async collectFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, {
      withFileTypes: true
    });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.collectFiles(fullPath)));
        continue;
      }

      if (/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private collectFrameworkSignals(content: string, frameworkSignals: Set<string>): void {
    if (/express|express\.Router/i.test(content)) {
      frameworkSignals.add("express");
    }

    if (/fastify/i.test(content)) {
      frameworkSignals.add("fastify");
    }

    if (/react|jsx|tsx|dangerouslySetInnerHTML/i.test(content)) {
      frameworkSignals.add("react");
    }

    if (/graphql|apollo|typeDefs|makeExecutableSchema/i.test(content)) {
      frameworkSignals.add("graphql");
    }
  }

  private collectEndpoints(content: string, discoveredEndpoints: Set<string>): void {
    const routePattern = /\b(?:router|app|server)\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

    for (const match of content.matchAll(routePattern)) {
      const endpoint = match[1];

      if (endpoint) {
        discoveredEndpoints.add(endpoint);
      }
    }
  }

  private collectViews(filePath: string, content: string, discoveredViews: Set<string>): void {
    if (!filePath.endsWith(".tsx") && !filePath.endsWith(".jsx")) {
      return;
    }

    const exportPattern = /export function (\w+)/g;

    for (const match of content.matchAll(exportPattern)) {
      const componentName = match[1];

      if (componentName) {
        discoveredViews.add(componentName);
      }
    }
  }

  private collectRiskIndicators(filePath: string, content: string): RiskIndicator[] {
    const indicators: RiskIndicator[] = [];

    if (/SELECT .*?\$\{.*?\}/is.test(content) || /query\s*=\s*`[^`]*\$\{[^}]+\}[^`]*`/is.test(content)) {
      indicators.push({
        domain: "injection",
        filePath,
        summary: "Dynamic string interpolation detected in query construction",
        locationHint: this.firstRoute(content)
      });
    }

    if (/dangerouslySetInnerHTML|innerHTML\s*=/.test(content)) {
      indicators.push({
        domain: "xss",
        filePath,
        summary: "Unsanitized HTML rendering surface detected",
        locationHint: null
      });
    }

    if (/fetch\(\s*(?:req|request|ctx)\.(?:body|query|params)\./.test(content)) {
      indicators.push({
        domain: "ssrf",
        filePath,
        summary: "Outbound request appears to use user-controlled input",
        locationHint: this.firstRoute(content)
      });
    }

    if (/router\.(?:get|post|put|patch|delete)\([^)]*:id/.test(content) && !/authorize|requireAuth|assertOwner/i.test(content)) {
      indicators.push({
        domain: "authorization",
        filePath,
        summary: "Route parameter used before any ownership check",
        locationHint: this.firstRoute(content)
      });
    }

    if (/\/login|signin|password/i.test(content) && !/rateLimit|throttle|otp|2fa/i.test(content)) {
      indicators.push({
        domain: "authentication",
        filePath,
        summary: "Authentication flow detected without nearby hardening signals",
        locationHint: this.firstRoute(content)
      });
    }

    if (/graphql|apollo|typeDefs|makeExecutableSchema/i.test(content) && /introspection|__schema|resolver/i.test(content)) {
      indicators.push({
        domain: "graphql",
        filePath,
        summary: "GraphQL surface exposes introspection or resolver signals that warrant review",
        locationHint: this.firstRoute(content)
      });
    }

    if (/tenant|workflow|state machine|approval/i.test(content) && !/assertInvariant|verifyInvariant/i.test(content)) {
      indicators.push({
        domain: "business-logic",
        filePath,
        summary: "Business workflow or multi-tenant logic detected without explicit invariant checks",
        locationHint: this.firstRoute(content)
      });
    }

    return indicators;
  }

  private collectAuthenticationSurface(riskIndicators: RiskIndicator[]): string[] {
    const values = new Set<string>();

    for (const indicator of riskIndicators) {
      if (indicator.domain === "authentication") {
        values.add("password");
      }
    }

    return [...values];
  }

  private firstRoute(content: string): string | null {
    const routePattern = /\b(?:router|app|server)\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/;
    return routePattern.exec(content)?.[1] ?? null;
  }
}
