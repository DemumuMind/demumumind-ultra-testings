import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { Client, Connection } from "@temporalio/client";
import dotenv from "dotenv";
import type {
  PipelineConfig,
  PipelineInput,
  PipelineProgress,
  WorkspaceArtifact,
  WorkspaceArtifactKind,
  WorkspaceArtifactPreview,
  WorkflowDetail,
  WorkspaceDetail,
  WorkflowSummary,
  WorkspaceSummary
} from "@shannon/shared";
import { reportSchema } from "@shannon/shared";

import { AuditSession, type AuditSessionRecord } from "../services/audit-session.js";
import { PROGRESS_QUERY, TASK_QUEUE, WORKFLOW_NAME } from "./shared.js";

dotenv.config();

const execFileAsync = promisify(execFile);
const DEFAULT_AUDIT_ROOT = resolve(process.cwd(), "audit-logs");

export interface WorkflowRuntimeClient {
  startWorkflow(input: {
    userId: string;
    url: string;
    repo: string;
    config?: string;
    output?: string;
    workspace?: string;
    wait?: boolean;
    pipelineTestingMode?: boolean;
  }): Promise<WorkflowSummary>;
  getWorkflows(): Promise<WorkflowSummary[]>;
  getWorkflow(workflowId: string): Promise<WorkflowDetail>;
  getWorkflowProgress(workflowId: string): Promise<PipelineProgress>;
  getWorkflowLogs(workflowId: string): Promise<{
    workflowId: string;
    logs: string[];
  }>;
  getWorkspaces(): Promise<WorkspaceSummary[]>;
  getWorkspace(workspaceId: string): Promise<WorkspaceDetail>;
  getWorkspaceArtifact(
    workspaceId: string,
    artifactKind: WorkspaceArtifactKind
  ): Promise<WorkspaceArtifactPreview>;
  stopWorkflow(workflowId: string): Promise<WorkflowSummary>;
  stopRuntime(input: { clean?: boolean }): Promise<{
    status: "stopped";
    clean: boolean;
    message: string;
  }>;
  checkRuntimeHealth(): Promise<boolean>;
}

export interface ClientArgs {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  waitForCompletion: boolean;
  pipelineTestingMode: boolean;
  resumeFromWorkspace?: string;
}

export interface WorkspaceResolution {
  workflowId: string;
  sessionId: string;
  isResume: boolean;
  terminatedWorkflows: string[];
}

interface SessionRecordShape {
  session: {
    id: string;
    webUrl: string;
    repoPath: string;
    originalWorkflowId: string;
    lastWorkflowId?: string;
    workflowIds?: string[];
  };
  status: WorkflowSummary["status"];
  workflowCount?: number;
  lastRunAt?: string | null;
}

function sanitizeWorkspaceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "workflow";
}

function deriveWorkspaceName(webUrl: string): string {
  try {
    return sanitizeWorkspaceName(new URL(webUrl).hostname);
  } catch {
    return "workflow";
  }
}

export function buildPipelineInput(
  args: ClientArgs,
  workspace: WorkspaceResolution,
  pipelineConfig?: PipelineConfig
): PipelineInput {
  return {
    webUrl: args.webUrl,
    repoPath: args.repoPath,
    workflowId: workspace.workflowId,
    sessionId: workspace.sessionId,
    ...(args.configPath ? { configPath: args.configPath } : {}),
    ...(args.outputPath ? { outputPath: args.outputPath } : {}),
    ...(args.pipelineTestingMode ? { pipelineTestingMode: true } : {}),
    ...(workspace.isResume ? { resumeFromWorkspace: workspace.sessionId } : {}),
    ...(workspace.terminatedWorkflows.length > 0
      ? { terminatedWorkflows: workspace.terminatedWorkflows }
      : {}),
    ...(pipelineConfig ? { pipelineConfig } : {})
  };
}

export async function resolveWorkspaceSession(input: {
  auditRoot: string;
  webUrl: string;
  repoPath: string;
  requestedWorkspace?: string;
  now?: () => number;
}): Promise<WorkspaceResolution> {
  const timestamp = (input.now ?? Date.now)();
  const sessionId = input.requestedWorkspace?.trim()
    ? sanitizeWorkspaceName(input.requestedWorkspace)
    : deriveWorkspaceName(input.webUrl);
  const sessionPath = join(input.auditRoot, sessionId, "session.json");

  if (existsSync(sessionPath)) {
    const raw = await readFile(sessionPath, "utf8");
    const session = JSON.parse(raw) as SessionRecordShape;

    if (session.session.webUrl !== input.webUrl) {
      throw new Error(
        `Workspace URL mismatch. Expected ${session.session.webUrl}, received ${input.webUrl}.`
      );
    }

    return {
      workflowId: `${sessionId}_resume_${timestamp}`,
      sessionId,
      isResume: true,
      terminatedWorkflows: []
    };
  }

  return {
    workflowId: `${sessionId}_shannon-${timestamp}`,
    sessionId,
    isResume: false,
    terminatedWorkflows: []
  };
}

export async function listWorkspaceSummaries(auditRoot: string): Promise<WorkspaceSummary[]> {
  if (!existsSync(auditRoot)) {
    return [];
  }

  const directories = await readdir(auditRoot, { withFileTypes: true });
  const pending = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sessionPath = join(auditRoot, entry.name, "session.json");
        if (!existsSync(sessionPath)) {
          return null;
        }

        const raw = await readFile(sessionPath, "utf8");
        const session = JSON.parse(raw) as SessionRecordShape;

        return {
          id: session.session.id,
          name: session.session.id,
          status: session.status,
          workflowCount: session.workflowCount ?? session.session.workflowIds?.length ?? 1,
          lastWorkflowId: session.session.lastWorkflowId ?? session.session.originalWorkflowId,
          lastRunAt: session.lastRunAt ?? null,
          targetUrl: session.session.webUrl,
          repoPath: session.session.repoPath
        } satisfies WorkspaceSummary;
      })
  );
  const summaries: WorkspaceSummary[] = [];

  for (const item of pending) {
    if (item) {
      summaries.push(item);
    }
  }

  return summaries
    .sort((left, right) => (right.lastRunAt ?? "").localeCompare(left.lastRunAt ?? ""));
}

function toWorkspaceSummary(session: AuditSessionRecord): WorkspaceSummary {
  return {
    id: session.session.id,
    name: session.session.id,
    status: session.status,
    workflowCount: session.workflowCount ?? session.session.workflowIds?.length ?? 1,
    lastWorkflowId: session.session.lastWorkflowId ?? session.session.originalWorkflowId,
    lastRunAt: session.lastRunAt ?? null,
    targetUrl: session.session.webUrl,
    repoPath: session.session.repoPath
  };
}

export async function listWorkflowSummaries(auditRoot: string): Promise<WorkflowSummary[]> {
  if (!existsSync(auditRoot)) {
    return [];
  }

  const directories = await readdir(auditRoot, { withFileTypes: true });
  const summaries = await Promise.all(
    directories
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const workflowPath = join(auditRoot, entry.name, "workflow.json");
        if (!existsSync(workflowPath)) {
          return null;
        }

        const raw = await readFile(workflowPath, "utf8");
        return JSON.parse(raw) as WorkflowSummary;
      })
  );

  return summaries
    .filter((summary): summary is WorkflowSummary => summary !== null)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export class TemporalPipelineClient implements WorkflowRuntimeClient {
  constructor(
    private readonly options: {
      address?: string;
      auditRoot?: string;
      namespace?: string;
      projectRoot?: string;
    } = {}
  ) {}

  async startWorkflow(input: {
    userId: string;
    url: string;
    repo: string;
    config?: string;
    output?: string;
    workspace?: string;
    wait?: boolean;
    pipelineTestingMode?: boolean;
  }): Promise<WorkflowSummary> {
    const auditRoot = this.auditRoot(input.output);
    const repoPath = resolve(input.repo);
    const workspace = await resolveWorkspaceSession({
      auditRoot,
      webUrl: input.url,
      repoPath,
      requestedWorkspace: input.workspace
    });

    const auditSession = new AuditSession({
      auditRoot,
      sessionId: workspace.sessionId,
      workflowId: workspace.workflowId,
      webUrl: input.url,
      repoPath
    });
    await auditSession.initialize();

    const pipelineInput = buildPipelineInput(
      {
        webUrl: input.url,
        repoPath,
        configPath: input.config ? resolve(input.config) : undefined,
        outputPath: auditRoot,
        waitForCompletion: input.wait ?? false,
        pipelineTestingMode: input.pipelineTestingMode ?? false,
        resumeFromWorkspace: workspace.isResume ? workspace.sessionId : undefined
      },
      workspace
    );

    const summary: WorkflowSummary = {
      id: workspace.workflowId,
      scanRunId: workspace.workflowId,
      reportId: null,
      status: "running",
      currentPhase: "preflight",
      targetUrl: input.url,
      repoPath,
      workspace: workspace.sessionId,
      reportPath: join(auditRoot, workspace.sessionId, "comprehensive_security_assessment_report.md"),
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: 0,
      totalCostUsd: 0,
      totalTurns: 0,
      agentCount: 13,
      phaseHistory: [
        {
          phase: "preflight",
          changedAt: new Date().toISOString()
        }
      ],
      agentBreakdown: []
    };

    await writeFile(
      join(auditRoot, workspace.sessionId, "workflow.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      join(auditRoot, workspace.sessionId, "report.json"),
      `${JSON.stringify(
        reportSchema.parse({
          id: `${workspace.workflowId}-report`,
          scanRunId: workspace.workflowId,
          findingIds: [],
          generatedAt: new Date().toISOString(),
          exploitPacks: [],
          coverageMatrix: [],
          unsupportedClasses: []
        }),
        null,
        2
      )}\n`,
      "utf8"
    );

    const connection = await Connection.connect({
      address: this.address()
    });
    const client = new Client({
      connection,
      namespace: this.options.namespace ?? "default"
    });

    try {
      await client.workflow.start(WORKFLOW_NAME, {
        taskQueue: TASK_QUEUE,
        workflowId: workspace.workflowId,
        args: [pipelineInput]
      });
    } finally {
      await connection.close();
    }

    return summary;
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDetail> {
    const located = await this.locateWorkspace(workflowId);
    if (!located) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const workflow = JSON.parse(
      await readFile(join(located.workspacePath, "workflow.json"), "utf8")
    ) as WorkflowSummary;
    const report = JSON.parse(await readFile(join(located.workspacePath, "report.json"), "utf8"));
    const logs = await this.readLogs(join(located.workspacePath, "workflow.log"));

    if (workflow.status === "running") {
      try {
        const progress = await this.readProgress(workflowId);
        workflow.currentPhase =
          (progress.currentPhase as WorkflowSummary["currentPhase"]) ?? workflow.currentPhase;
      } catch {
        // Leave persisted running state in place when Temporal is unavailable.
      }
    }

    return {
      workflow,
      report,
      findings: [],
      logs
    };
  }

  async getWorkflows(): Promise<WorkflowSummary[]> {
    return listWorkflowSummaries(this.auditRoot());
  }

  async getWorkflowProgress(workflowId: string): Promise<PipelineProgress> {
    try {
      return await this.readProgress(workflowId);
    } catch {
      const detail = await this.getWorkflow(workflowId);
      return {
        workflowId,
        status: detail.workflow.status === "failed" ? "failed" : detail.workflow.status === "completed" ? "completed" : "running",
        currentPhase: detail.workflow.currentPhase,
        currentAgent: null,
        completedAgents: [],
        failedAgent: null,
        error: detail.workflow.status === "failed" ? "Workflow failed" : null,
        startTime: new Date(detail.workflow.startedAt).getTime(),
        elapsedMs: detail.workflow.durationMs,
        agentMetrics: {},
        summary:
          detail.workflow.status === "completed"
            ? {
                totalCostUsd: detail.workflow.totalCostUsd,
                totalDurationMs: detail.workflow.durationMs,
                totalTurns: detail.workflow.totalTurns,
                agentCount: detail.workflow.agentCount
              }
            : null
      };
    }
  }

  async getWorkflowLogs(workflowId: string): Promise<{ workflowId: string; logs: string[] }> {
    const located = await this.locateWorkspace(workflowId);
    if (!located) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    return {
      workflowId,
      logs: await this.readLogs(join(located.workspacePath, "workflow.log"))
    };
  }

  async getWorkspaces(): Promise<WorkspaceSummary[]> {
    return listWorkspaceSummaries(this.auditRoot());
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceDetail> {
    const located = await this.locateWorkspaceById(workspaceId);
    if (!located) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    return {
      workspace: toWorkspaceSummary(located.session),
      workflowIds: located.session.session.workflowIds ?? [located.session.session.originalWorkflowId],
      resumeAttempts: located.session.session.resumeAttempts ?? [],
      artifacts: await this.listWorkspaceArtifacts(located.workspacePath, located.session)
    };
  }

  async getWorkspaceArtifact(
    workspaceId: string,
    artifactKind: WorkspaceArtifactKind
  ): Promise<WorkspaceArtifactPreview> {
    const located = await this.locateWorkspaceById(workspaceId);
    if (!located) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const artifact = (await this.listWorkspaceArtifacts(located.workspacePath, located.session)).find(
      (item) => item.kind === artifactKind
    );

    if (!artifact || !artifact.exists) {
      throw new Error(`Artifact not found: ${artifactKind}`);
    }

    let content = await readFile(artifact.path, "utf8");
    const contentType = this.artifactContentType(artifact);

    if (contentType === "application/json") {
      try {
        content = `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
      } catch {
        // Keep the raw content when the file is not valid JSON.
      }
    }

    const previewLimit = 120_000;
    const truncated = content.length > previewLimit;

    return {
      artifact,
      contentType,
      content: truncated ? `${content.slice(0, previewLimit)}\n\n[preview truncated]\n` : content,
      truncated
    };
  }

  async stopWorkflow(workflowId: string): Promise<WorkflowSummary> {
    const located = await this.locateWorkspace(workflowId);
    if (!located) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    await this.terminateWorkflow(workflowId);

    const workflowPath = join(located.workspacePath, "workflow.json");
    const workflow = JSON.parse(await readFile(workflowPath, "utf8")) as WorkflowSummary;
    const endedAt = new Date().toISOString();
    const updated: WorkflowSummary = {
      ...workflow,
      status: "stopped",
      endedAt,
      durationMs:
        workflow.durationMs > 0
          ? workflow.durationMs
          : Math.max(0, Date.now() - new Date(workflow.startedAt).getTime())
    };

    await writeFile(workflowPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

    const sessionPath = join(located.workspacePath, "session.json");
    if (existsSync(sessionPath)) {
      const session = JSON.parse(await readFile(sessionPath, "utf8")) as AuditSessionRecord;
      session.status = "stopped";
      session.lastRunAt = endedAt;
      session.session.lastWorkflowId = workflowId;
      await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    }

    await this.appendLog(join(located.workspacePath, "workflow.log"), workflowId, "STOPPED");

    return updated;
  }

  async stopRuntime(input: { clean?: boolean }): Promise<{
    status: "stopped";
    clean: boolean;
    message: string;
  }> {
    try {
      await execFileAsync("docker", ["compose", "down"], {
        cwd: this.options.projectRoot ?? process.cwd(),
        windowsHide: true
      });
    } catch {
      // Stop should stay idempotent for local tests.
    }

    if (input.clean) {
      await rm(this.auditRoot(), {
        recursive: true,
        force: true
      });
    }

    return {
      status: "stopped",
      clean: input.clean ?? false,
      message: input.clean ? "Removed workflow data" : "Stopped local runtime"
    };
  }

  async checkRuntimeHealth(): Promise<boolean> {
    try {
      const connection = await Connection.connect({
        address: this.address()
      });
      await connection.close();
      return true;
    } catch {
      return false;
    }
  }

  private address(): string {
    return this.options.address ?? process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
  }

  private auditRoot(explicitOutput?: string): string {
    return explicitOutput ? resolve(explicitOutput) : this.options.auditRoot ?? DEFAULT_AUDIT_ROOT;
  }

  private async locateWorkspace(workflowId: string): Promise<{
    workspacePath: string;
    session: AuditSessionRecord;
  } | null> {
    const auditRoot = this.auditRoot();
    const directories = await readdir(auditRoot, { withFileTypes: true }).catch(() => []);

    for (const directory of directories) {
      if (!directory.isDirectory()) {
        continue;
      }

      const sessionPath = join(auditRoot, directory.name, "session.json");
      if (!existsSync(sessionPath)) {
        continue;
      }

      const raw = await readFile(sessionPath, "utf8");
      const session = JSON.parse(raw) as AuditSessionRecord;
      const workflowIds = session.session.workflowIds ?? [session.session.originalWorkflowId];

      if (workflowIds.includes(workflowId) || session.session.lastWorkflowId === workflowId) {
        return {
          workspacePath: join(auditRoot, directory.name),
          session
        };
      }
    }

    return null;
  }

  private async locateWorkspaceById(workspaceId: string): Promise<{
    workspacePath: string;
    session: AuditSessionRecord;
  } | null> {
    const workspacePath = join(this.auditRoot(), workspaceId);
    const sessionPath = join(workspacePath, "session.json");

    if (!existsSync(sessionPath)) {
      return null;
    }

    return {
      workspacePath,
      session: JSON.parse(await readFile(sessionPath, "utf8")) as AuditSessionRecord
    };
  }

  private async listWorkspaceArtifacts(
    workspacePath: string,
    session: AuditSessionRecord
  ): Promise<WorkspaceArtifact[]> {
    const workflowSummaryPath = join(workspacePath, "workflow.json");
    const reportJsonPath = join(workspacePath, "report.json");
    const workflowLogPath = join(workspacePath, "workflow.log");
    const sessionPath = join(workspacePath, "session.json");
    const finalReportPath =
      session.reportPath ??
      (existsSync(workflowSummaryPath)
        ? ((JSON.parse(await readFile(workflowSummaryPath, "utf8")) as WorkflowSummary).reportPath ??
          null)
        : null);

    return [
      {
        kind: "session",
        label: "Session Metadata",
        path: sessionPath,
        exists: existsSync(sessionPath)
      },
      {
        kind: "workflow-summary",
        label: "Workflow Summary",
        path: workflowSummaryPath,
        exists: existsSync(workflowSummaryPath)
      },
      {
        kind: "workflow-log",
        label: "Workflow Log",
        path: workflowLogPath,
        exists: existsSync(workflowLogPath)
      },
      {
        kind: "report-json",
        label: "Structured Report",
        path: reportJsonPath,
        exists: existsSync(reportJsonPath)
      },
      {
        kind: "final-report",
        label: "Final Report",
        path: finalReportPath ?? join(workspacePath, "comprehensive_security_assessment_report.md"),
        exists: finalReportPath ? existsSync(finalReportPath) : false
      }
    ];
  }

  private artifactContentType(artifact: WorkspaceArtifact): string {
    switch (artifact.kind) {
      case "session":
      case "workflow-summary":
      case "report-json":
        return "application/json";
      case "workflow-log":
        return "text/plain";
      case "final-report":
        return extname(artifact.path).toLowerCase() === ".md" ? "text/markdown" : "text/plain";
      default:
        return "text/plain";
    }
  }

  private async readLogs(path: string): Promise<string[]> {
    if (!existsSync(path)) {
      return [];
    }

    return (await readFile(path, "utf8"))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private async appendLog(path: string, workflowId: string, status: string): Promise<void> {
    const existing = existsSync(path) ? await readFile(path, "utf8") : "";
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(
      path,
      `${existing}${prefix}[${new Date().toISOString()}] [workflow] ${status} ${workflowId}\n`,
      "utf8"
    );
  }

  private async readProgress(workflowId: string): Promise<PipelineProgress> {
    const connection = await Connection.connect({
      address: this.address()
    });
    const client = new Client({
      connection,
      namespace: this.options.namespace ?? "default"
    });

    try {
      const handle = client.workflow.getHandle(workflowId);
      return await handle.query<PipelineProgress>(PROGRESS_QUERY);
    } finally {
      await connection.close();
    }
  }

  private async terminateWorkflow(workflowId: string): Promise<void> {
    try {
      const connection = await Connection.connect({
        address: this.address()
      });
      const client = new Client({
        connection,
        namespace: this.options.namespace ?? "default"
      });

      try {
        const handle = client.workflow.getHandle(workflowId);
        await handle.terminate("Stopped from dashboard");
      } finally {
        await connection.close();
      }
    } catch {
      // Persist stopped state locally even when Temporal is already unavailable.
    }
  }
}
