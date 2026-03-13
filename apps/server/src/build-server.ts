import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import {
  CapabilityRegistry,
  CodebaseReconService,
  EnvironmentDoctor,
  HeuristicDomainAnalyzer,
  ProjectBootstrapService,
  ProviderCatalogService,
  RunnerRegistry,
  ScanOrchestrator
} from "@shannon/core";
import type {
  AttackDomain,
  AttackHypothesis,
  ExploitAttempt,
  ProjectConfig,
  ScanRun,
  TargetApplication
} from "@shannon/shared";
import type { OpenAIAuthBroker, StateRepository } from "@shannon/core";

interface BuildServerOptions {
  stateRepository: StateRepository;
  authBroker: OpenAIAuthBroker;
  scanOrchestrator: ScanOrchestrator;
}

class SimulationExploiter {
  constructor(
    public readonly domain: AttackDomain,
    private readonly stateRepository: StateRepository
  ) {}

  async exploit(hypothesis: AttackHypothesis): Promise<ExploitAttempt> {
    const scanRun = await this.stateRepository.get<ScanRun>("scanRuns", hypothesis.scanRunId);
    const target = scanRun
      ? await this.stateRepository.get<TargetApplication>("targets", scanRun.targetId)
      : undefined;
    const project =
      scanRun?.projectId
        ? await this.stateRepository.get<ProjectConfig>("projects", scanRun.projectId)
        : undefined;

    const simulationEnabled =
      (target && target.verificationMode === "simulation") ||
      (project && project.proofMode === "safe" && project.policy.activeValidationAllowed);

    if (!simulationEnabled) {
      return this.failedAttempt(hypothesis, "Simulation verifier is disabled for this target");
    }

    const description = `${hypothesis.title} ${hypothesis.description}`.toLowerCase();
    const strongSignal =
      (this.domain === "injection" && /query|sql|interpolation/.test(description)) ||
      (this.domain === "xss" && /html|script/.test(description)) ||
      (this.domain === "ssrf" && /outbound|request/.test(description)) ||
      (this.domain === "authentication" && /auth|login|password/.test(description)) ||
      (this.domain === "authorization" && /ownership|authorization|idor/.test(description)) ||
      (this.domain === "graphql" && /graphql|resolver|introspection/.test(description)) ||
      (this.domain === "business-logic" && /workflow|invariant|tenant|state machine/.test(description));

    if (!strongSignal) {
      return this.failedAttempt(hypothesis, "No strong simulation signal was found");
    }

    return {
      id: randomUUID(),
      scanRunId: hypothesis.scanRunId,
      hypothesisId: hypothesis.id,
      domain: hypothesis.domain,
      status: "confirmed",
      proofOfConcept: `SIMULATED-${hypothesis.domain.toUpperCase()}: replay ${hypothesis.description}`,
      impactSummary: `Simulation mode confirmed a reproducible ${hypothesis.domain} signal`,
      evidenceArtifacts: hypothesis.evidence
    };
  }

  private failedAttempt(hypothesis: AttackHypothesis, impactSummary: string): ExploitAttempt {
    return {
      id: randomUUID(),
      scanRunId: hypothesis.scanRunId,
      hypothesisId: hypothesis.id,
      domain: hypothesis.domain,
      status: "failed",
      proofOfConcept: null,
      impactSummary,
      evidenceArtifacts: hypothesis.evidence
    };
  }
}

function createSimulationOrchestrator(stateRepository: StateRepository): ScanOrchestrator {
  const domains: AttackDomain[] = [
    "injection",
    "xss",
    "ssrf",
    "authentication",
    "authorization",
    "graphql",
    "business-logic"
  ];

  return new ScanOrchestrator({
    stateRepository,
    reconService: new CodebaseReconService(),
    analyzers: domains.map((domain) => new HeuristicDomainAnalyzer(domain)),
    exploiters: domains.map((domain) => new SimulationExploiter(domain, stateRepository))
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireStringField(payload: unknown, field: string): string {
  if (!isRecord(payload) || typeof payload[field] !== "string" || payload[field].trim() === "") {
    throw new Error(`Field "${field}" must be a non-empty string`);
  }

  return payload[field];
}

export function buildServer(options: BuildServerOptions) {
  const server = Fastify({
    logger: false
  });
  const doctor = new EnvironmentDoctor();
  const providers = new ProviderCatalogService();
  const capabilities = new CapabilityRegistry();
  const projectBootstrapService = new ProjectBootstrapService();
  const runners = new RunnerRegistry();

  void server.register(cors, {
    origin: true,
    credentials: true
  });
  void server.register(cookie);

  server.get("/health", async () => ({
    status: "ok"
  }));

  server.get("/api/bootstrap/doctor", async () => doctor.inspect());
  server.get("/api/providers", async () => providers.list());
  server.get("/api/capabilities", async () => capabilities.list());
  server.get("/api/runners", async () => runners.list());

  server.post("/api/runners/attach", async (request, reply) => {
    const name =
      isRecord(request.body) && typeof request.body.name === "string" && request.body.name.trim()
        ? request.body.name
        : undefined;
    return reply.status(201).send(runners.attach(name));
  });

  server.post("/api/auth/browser/start", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const redirectUri =
        isRecord(request.body) && typeof request.body.redirectUri === "string"
          ? request.body.redirectUri
          : undefined;
      const result = await options.authBroker.startBrowserLogin({
        userId,
        redirectUri
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/auth/browser/callback", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const code = requireStringField(request.body, "code");
      const state = requireStringField(request.body, "state");
      const result = await options.authBroker.completeBrowserLogin({
        userId,
        code,
        state
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/auth/device/start", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const result = await options.authBroker.startDeviceLogin({
        userId
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/auth/device/poll", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const sessionId = requireStringField(request.body, "sessionId");
      const result = await options.authBroker.pollDeviceLogin({
        userId,
        sessionId
      });
      return reply.send(result);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/auth/logout", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      await options.authBroker.logout(userId);
      return reply.status(204).send();
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.get("/api/auth/users/:userId/connection", async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const connection = await options.authBroker.getConnectionForUser(userId);

    if (!connection) {
      return reply.status(404).send({
        error: "Connection not found"
      });
    }

    return reply.send(connection);
  });

  server.get("/api/targets", async () => {
    return options.stateRepository.list<TargetApplication>("targets");
  });

  server.get("/api/projects", async () => {
    return options.stateRepository.list<ProjectConfig>("projects");
  });

  server.post("/api/projects/init", async (request, reply) => {
    try {
      const projectRoot = requireStringField(request.body, "projectRoot");
      const sourceRoots =
        isRecord(request.body) && Array.isArray(request.body.sourceRoots)
          ? request.body.sourceRoots.filter((value): value is string => typeof value === "string")
          : [];

      if (sourceRoots.length === 0) {
        throw new Error('Field "sourceRoots" must contain at least one source root');
      }

      const result = await projectBootstrapService.initializeProject({
        projectRoot,
        name: requireStringField(request.body, "name"),
        baseUrl: requireStringField(request.body, "baseUrl"),
        sourceRoots,
        providerPreferences:
          isRecord(request.body) && Array.isArray(request.body.providerPreferences)
            ? request.body.providerPreferences.filter(
                (value): value is "openai" | "nvidia" =>
                  value === "openai" || value === "nvidia"
              )
            : undefined
      });

      await options.stateRepository.put("projects", result.project);
      return reply.status(201).send(result);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/targets", async (request, reply) => {
    try {
      const target: TargetApplication = {
        id: randomUUID(),
        name: requireStringField(request.body, "name"),
        baseUrl: requireStringField(request.body, "baseUrl"),
        sourceBundlePath: requireStringField(request.body, "sourceBundlePath"),
        verificationMode:
          isRecord(request.body) && request.body.verificationMode === "simulation"
            ? "simulation"
            : "passive",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await options.stateRepository.put("targets", target);
      return reply.status(201).send(target);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.get("/api/scans", async () => options.stateRepository.list<ScanRun>("scanRuns"));

  server.get("/api/scans/:scanRunId", async (request, reply) => {
    const { scanRunId } = request.params as { scanRunId: string };
    const scanRun = await options.stateRepository.get<ScanRun>("scanRuns", scanRunId);

    if (!scanRun) {
      return reply.status(404).send({
        error: "Scan run not found"
      });
    }

    return reply.send(scanRun);
  });

  server.post("/api/scans", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const targetId =
        isRecord(request.body) && typeof request.body.targetId === "string"
          ? request.body.targetId
          : undefined;
      const projectId =
        isRecord(request.body) && typeof request.body.projectId === "string"
          ? request.body.projectId
          : undefined;

      let target: Pick<TargetApplication, "id" | "sourceBundlePath" | "verificationMode"> | null =
        null;

      if (targetId) {
        const existingTarget = await options.stateRepository.get<TargetApplication>("targets", targetId);
        target = existingTarget
          ? {
              id: existingTarget.id,
              sourceBundlePath: existingTarget.sourceBundlePath,
              verificationMode: existingTarget.verificationMode
            }
          : null;
      } else if (projectId) {
        const project = await options.stateRepository.get<ProjectConfig>("projects", projectId);

        if (project) {
          target = {
            id: project.id,
            sourceBundlePath: project.sourceRoots[0] ?? project.projectRoot,
            verificationMode: "simulation"
          };
        }
      }

      if (!target) {
        return reply.status(404).send({
          error: targetId ? "Target not found" : "Project not found"
        });
      }

      const orchestrator =
        target.verificationMode === "simulation"
          ? createSimulationOrchestrator(options.stateRepository)
          : options.scanOrchestrator;

      const queued = await orchestrator.enqueueScan({
        initiatedByUserId: userId,
        targetId: target.id,
        sourceBundleId: target.sourceBundlePath,
        projectId: projectId ?? undefined
      });
      const completed = await orchestrator.processNextRun();

      return reply.status(201).send(completed ?? queued);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.get("/api/reports/:scanRunId", async (request, reply) => {
    const { scanRunId } = request.params as { scanRunId: string };
    const reports = await options.stateRepository.list<{ id: string; scanRunId: string; findingIds: string[] }>(
      "reports"
    );
    const report = reports.find((item) => item.scanRunId === scanRunId);

    if (!report) {
      return reply.status(404).send({
        error: "Report not found"
      });
    }

    const findings = (await options.stateRepository.list<{ id: string } & Record<string, unknown>>(
      "confirmedFindings"
    )).filter((finding) => report.findingIds.includes(finding.id));

    return reply.send({
      report,
      findings
    });
  });

  return server;
}
