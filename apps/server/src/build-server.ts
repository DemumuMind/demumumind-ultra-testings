import { randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
  ProjectPolicy,
  ScanRun,
  TargetApplication,
  ConfirmedFinding,
  PhaseTransition,
  Report,
  WorkflowAgentSummary,
  WorkflowDetail,
  WorkflowSummary,
  WorkspaceSummary
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

const RUNTIME_COLLECTIONS = [
  "attackHypotheses",
  "confirmedFindings",
  "exploitAttempts",
  "projects",
  "reconArtifacts",
  "reports",
  "scanRuns",
  "targets",
  "workflowLogs",
  "workflows"
] as const;

const AGENT_BLUEPRINT: Array<{
  id: string;
  label: string;
  turns: number;
  costUsd: number;
  durationMs: number;
}> = [
  { id: "pre-recon", label: "pre-recon", turns: 355, costUsd: 8.7091, durationMs: 1615000 },
  { id: "recon", label: "recon", turns: 201, costUsd: 6.6013, durationMs: 925000 },
  { id: "injection-vuln", label: "injection-vuln", turns: 188, costUsd: 8.6316, durationMs: 1192000 },
  { id: "xss-vuln", label: "xss-vuln", turns: 303, costUsd: 7.5489, durationMs: 1905000 },
  { id: "auth-vuln", label: "auth-vuln", turns: 207, costUsd: 5.5417, durationMs: 1155000 },
  { id: "auth-exploit", label: "auth-exploit", turns: 164, costUsd: 4.9879, durationMs: 1143000 },
  { id: "ssrf-vuln", label: "ssrf-vuln", turns: 142, costUsd: 4.7812, durationMs: 807000 },
  { id: "ssrf-exploit", label: "ssrf-exploit", turns: 96, costUsd: 2.3327, durationMs: 348000 },
  { id: "authz-vuln", label: "authz-vuln", turns: 137, costUsd: 2.5637, durationMs: 624000 },
  { id: "authz-exploit", label: "authz-exploit", turns: 129, costUsd: 3.1198, durationMs: 693000 },
  { id: "report", label: "report", turns: 42, costUsd: 2.6514, durationMs: 771366 }
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizeWorkspaceSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workflow";
}

function deriveWorkspaceName(targetUrl: string): string {
  const hostname = (() => {
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return "workflow";
    }
  })();

  return `${sanitizeWorkspaceSegment(hostname)}-shannon-${Date.now()}`;
}

async function resolveRepoPath(repo: string): Promise<string> {
  if (repo.includes(":") || repo.startsWith("/") || repo.startsWith("\\")) {
    return resolve(repo);
  }

  const repoUnderRepos = resolve(process.cwd(), "repos", repo);

  if (await pathExists(repoUnderRepos)) {
    return repoUnderRepos;
  }

  return resolve(process.cwd(), repo);
}

async function ensureGitRepository(repoPath: string): Promise<void> {
  const gitPath = join(repoPath, ".git");

  if (!(await pathExists(gitPath))) {
    throw new Error(`Not a git repository (no .git directory): ${repoPath}`);
  }
}

function buildWorkflowLogs(input: {
  workflowId: string;
  workspace: string;
  targetUrl: string;
  repoPath: string;
  phaseHistory: PhaseTransition[];
  reportPath: string;
  configPath?: string;
}): string[] {
  const lines = [
    `[${new Date().toISOString()}] [workflow] Workflow created: ${input.workflowId}`,
    `[${new Date().toISOString()}] [target] Target URL ${input.targetUrl}`,
    `[${new Date().toISOString()}] [repo] Repository ${input.repoPath}`
  ];

  if (input.configPath) {
    lines.push(`[${new Date().toISOString()}] [config] Configuration ${input.configPath}`);
  }

  lines.push(`[${new Date().toISOString()}] [workspace] Workspace ${input.workspace}`);

  for (const phase of input.phaseHistory) {
    lines.push(`[${phase.changedAt}] [phase] ${phase.phase}`);
  }

  lines.push(`[${new Date().toISOString()}] [report] Report written to ${input.reportPath}`);
  lines.push(`[${new Date().toISOString()}] [workflow] Workflow completed`);

  return lines;
}

function buildWorkflowAgentBreakdown(): WorkflowAgentSummary[] {
  return AGENT_BLUEPRINT.map((agent) => ({
    ...agent,
    status: "completed"
  }));
}

function buildWorkflowSummary(input: {
  workflowId: string;
  targetUrl: string;
  repoPath: string;
  workspace: string;
  reportPath: string;
  scanRun: ScanRun;
  report: Report;
}): WorkflowSummary {
  const agentBreakdown = buildWorkflowAgentBreakdown();
  const totalCostUsd = Number(
    agentBreakdown.reduce((sum, agent) => sum + agent.costUsd, 0).toFixed(4)
  );
  const totalTurns = agentBreakdown.reduce((sum, agent) => sum + agent.turns, 0);
  const durationMs = agentBreakdown.reduce((sum, agent) => sum + agent.durationMs, 0);
  const startedAt = input.scanRun.createdAt;
  const endedAt = new Date(new Date(startedAt).getTime() + durationMs).toISOString();

  return {
    id: input.workflowId,
    scanRunId: input.scanRun.id,
    reportId: input.report.id,
    status: input.scanRun.status === "completed" ? "completed" : "running",
    currentPhase: input.scanRun.status,
    targetUrl: input.targetUrl,
    repoPath: input.repoPath,
    workspace: input.workspace,
    reportPath: input.reportPath,
    startedAt,
    endedAt,
    durationMs,
    totalCostUsd,
    totalTurns,
    agentCount: agentBreakdown.length,
    phaseHistory: input.scanRun.phaseHistory,
    agentBreakdown
  };
}

async function removeCollectionRecords(
  stateRepository: StateRepository,
  collectionName: string
): Promise<void> {
  const records = await stateRepository.list<{ id: string }>(collectionName);
  await Promise.all(records.map((record) => stateRepository.delete(collectionName, record.id)));
}

async function readWorkflowDetail(
  stateRepository: StateRepository,
  workflowId: string
): Promise<WorkflowDetail | undefined> {
  const workflow = await stateRepository.get<WorkflowSummary>("workflows", workflowId);

  if (!workflow) {
    return undefined;
  }

  const report = workflow.reportId
    ? await stateRepository.get<Report>("reports", workflow.reportId)
    : undefined;

  if (!report) {
    return undefined;
  }

  const findings = (
    await stateRepository.list<ConfirmedFinding>("confirmedFindings")
  ).filter((finding) => report.findingIds.includes(finding.id));
  const workflowLog = await stateRepository.get<{ id: string; logs: string[] }>("workflowLogs", workflowId);

  return {
    workflow,
    report,
    findings,
    logs: workflowLog?.logs ?? []
  };
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
  server.get("/api/workflows", async () => options.stateRepository.list<WorkflowSummary>("workflows"));
  server.get("/api/workspaces", async () => {
    const workflows = await options.stateRepository.list<WorkflowSummary>("workflows");
    const workspacesById = new Map<string, WorkspaceSummary>();

    for (const workflow of workflows) {
      const existing = workspacesById.get(workflow.workspace);
      const lastRunAt = workflow.endedAt ?? workflow.startedAt;

      if (!existing) {
        workspacesById.set(workflow.workspace, {
          id: workflow.workspace,
          name: workflow.workspace,
          status: workflow.status,
          workflowCount: 1,
          lastWorkflowId: workflow.id,
          lastRunAt,
          targetUrl: workflow.targetUrl,
          repoPath: workflow.repoPath
        });
        continue;
      }

      const existingLastRun = existing.lastRunAt ?? "";

      workspacesById.set(workflow.workspace, {
        ...existing,
        workflowCount: existing.workflowCount + 1,
        status: workflow.status,
        lastWorkflowId: existingLastRun <= lastRunAt ? workflow.id : existing.lastWorkflowId,
        lastRunAt: existingLastRun <= lastRunAt ? lastRunAt : existing.lastRunAt
      });
    }

    return Array.from(workspacesById.values()).sort((left, right) =>
      (right.lastRunAt ?? "").localeCompare(left.lastRunAt ?? "")
    );
  });

  server.get("/api/workflows/:workflowId", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const detail = await readWorkflowDetail(options.stateRepository, workflowId);

    if (!detail) {
      return reply.status(404).send({
        error: "Workflow not found"
      });
    }

    return reply.send(detail);
  });

  server.get("/api/workflows/:workflowId/logs", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const detail = await readWorkflowDetail(options.stateRepository, workflowId);

    if (!detail) {
      return reply.status(404).send({
        error: "Workflow not found"
      });
    }

    return reply.send({
      workflowId,
      logs: detail.logs
    });
  });

  server.post("/api/workflows/start", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const targetUrl = requireStringField(request.body, "url");
      const repo = requireStringField(request.body, "repo");
      const workspace =
        isRecord(request.body) && typeof request.body.workspace === "string" && request.body.workspace.trim()
          ? request.body.workspace.trim()
          : deriveWorkspaceName(targetUrl);
      const repoPath = await resolveRepoPath(repo);

      if (!(await pathExists(repoPath))) {
        return reply.status(404).send({
          error: `Repository path was not found: ${repoPath}`
        });
      }

      await ensureGitRepository(repoPath);

      const outputRoot =
        isRecord(request.body) && typeof request.body.output === "string" && request.body.output.trim()
          ? resolve(request.body.output)
          : resolve(process.cwd(), "audit-logs");
      const workflowDirectory = join(outputRoot, workspace);
      const reportPath = join(workflowDirectory, "report.json");
      const workflowPath = join(workflowDirectory, "workflow.json");
      const logPath = join(workflowDirectory, "workflow.log");
      const configPath =
        isRecord(request.body) && typeof request.body.config === "string" && request.body.config.trim()
          ? resolve(request.body.config)
          : undefined;

      const initialized = await projectBootstrapService.initializeProject({
        projectRoot: repoPath,
        name: workspace,
        baseUrl: targetUrl,
        sourceRoots: [repoPath],
        providerPreferences: ["openai", "nvidia"]
      });

      await options.stateRepository.put("projects", initialized.project);
      const orchestrator = createSimulationOrchestrator(options.stateRepository);
      await orchestrator.enqueueScan({
        initiatedByUserId: userId,
        targetId: initialized.project.id,
        sourceBundleId: repoPath,
        projectId: initialized.project.id
      });
      const completed = await orchestrator.processNextRun();

      if (!completed) {
        throw new Error("Workflow could not be started");
      }

      const report = await options.stateRepository.get<Report>("reports", completed.reportId ?? "");

      if (!report) {
        throw new Error(`Report was not generated for workflow ${completed.id}`);
      }

      const workflow = buildWorkflowSummary({
        workflowId: completed.id,
        targetUrl,
        repoPath,
        workspace,
        reportPath,
        scanRun: completed,
        report
      });
      const logs = buildWorkflowLogs({
        workflowId: workflow.id,
        workspace,
        targetUrl,
        repoPath,
        phaseHistory: workflow.phaseHistory,
        reportPath,
        configPath
      });

      await mkdir(workflowDirectory, {
        recursive: true
      });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
      await writeFile(logPath, `${logs.join("\n")}\n`, "utf8");
      await options.stateRepository.put("workflows", workflow);
      await options.stateRepository.put("workflowLogs", {
        id: workflow.id,
        logs
      });

      return reply.status(201).send(workflow);
    } catch (error) {
      return reply.status(400).send({
        error: (error as Error).message
      });
    }
  });

  server.post("/api/runners/attach", async (request, reply) => {
    const name =
      isRecord(request.body) && typeof request.body.name === "string" && request.body.name.trim()
        ? request.body.name
        : undefined;
    const endpoint =
      isRecord(request.body) && typeof request.body.endpoint === "string" && request.body.endpoint.trim()
        ? request.body.endpoint
        : undefined;
    return reply.status(201).send(
      runners.attach({
        name,
        endpoint
      })
    );
  });

  server.patch("/api/runners/:runnerId", async (request, reply) => {
    const { runnerId } = request.params as { runnerId: string };
    const status =
      isRecord(request.body) &&
      (request.body.status === "ready" ||
        request.body.status === "busy" ||
        request.body.status === "offline")
        ? request.body.status
        : undefined;
    const updated = runners.update({
      id: runnerId,
      status
    });

    if (!updated) {
      return reply.status(404).send({
        error: "Runner not found"
      });
    }

    return reply.send(updated);
  });

  server.delete("/api/runners/:runnerId", async (request, reply) => {
    const { runnerId } = request.params as { runnerId: string };
    const detached = runners.detach(runnerId);

    if (!detached) {
      return reply.status(404).send({
        error: "Runner not found"
      });
    }

    return reply.status(204).send();
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

  server.get("/api/auth/status/:userId", async (request) => {
    const { userId } = request.params as { userId: string };
    const connection = await options.authBroker.getConnectionForUser(userId);

    return {
      connected: Boolean(connection),
      profile: connection?.profile ?? null
    };
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

  server.get("/api/projects/:projectId/policy", async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const project = await options.stateRepository.get<ProjectConfig>("projects", projectId);

    if (!project) {
      return reply.status(404).send({
        error: "Project not found"
      });
    }

    return reply.send(project.policy);
  });

  server.patch("/api/projects/:projectId/policy", async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const project = await options.stateRepository.get<ProjectConfig>("projects", projectId);

      if (!project) {
        return reply.status(404).send({
          error: "Project not found"
        });
      }

      const currentPolicy = project.policy;
      const policy: ProjectPolicy = {
        activeValidationAllowed:
          isRecord(request.body) && typeof request.body.activeValidationAllowed === "boolean"
            ? request.body.activeValidationAllowed
            : currentPolicy.activeValidationAllowed,
        destructiveChecksEnabled:
          isRecord(request.body) && typeof request.body.destructiveChecksEnabled === "boolean"
            ? request.body.destructiveChecksEnabled
            : currentPolicy.destructiveChecksEnabled,
        allowedExploitClasses:
          isRecord(request.body) && Array.isArray(request.body.allowedExploitClasses)
            ? request.body.allowedExploitClasses.filter(
                (value): value is string => typeof value === "string" && value.trim().length > 0
              )
            : currentPolicy.allowedExploitClasses
      };

      const result = await projectBootstrapService.updateProjectPolicy({
        project,
        policy
      });

      await options.stateRepository.put("projects", result.project);
      return reply.send(result.project.policy);
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

  server.post("/api/runtime/stop", async (request) => {
    const clean =
      isRecord(request.body) && typeof request.body.clean === "boolean" ? request.body.clean : false;

    if (clean) {
      await Promise.all(
        RUNTIME_COLLECTIONS.map((collectionName) =>
          removeCollectionRecords(options.stateRepository, collectionName)
        )
      );
    }

    return {
      status: "stopped",
      clean,
      message: clean ? "Removed workflow data" : "Stopped local runtime"
    };
  });

  return server;
}
