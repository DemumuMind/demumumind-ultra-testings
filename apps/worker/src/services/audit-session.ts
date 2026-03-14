import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { PipelineAgentMetrics } from "@shannon/shared";

export interface ResumeAttemptRecord {
  workflowId: string;
  supersededWorkflowIds: string[];
  checkpointHash: string;
}

export interface AuditSessionRecord {
  session: {
    id: string;
    webUrl: string;
    repoPath: string;
    originalWorkflowId: string;
    lastWorkflowId: string;
    workflowIds: string[];
    resumeAttempts: ResumeAttemptRecord[];
  };
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  workflowCount: number;
  lastRunAt: string | null;
  reportPath: string | null;
  metrics: {
    agents: Record<
      string,
      {
        status: "success" | "failed" | "skipped";
        checkpoint?: string;
        deliverableFilename?: string;
        metrics?: PipelineAgentMetrics;
      }
    >;
  };
}

interface AuditSessionOptions {
  auditRoot: string;
  sessionId: string;
  workflowId: string;
  webUrl: string;
  repoPath: string;
  now?: () => string;
}

export class AuditSession {
  private readonly now: () => string;

  constructor(private readonly options: AuditSessionOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  workspaceDirectory(): string {
    return join(this.options.auditRoot, this.options.sessionId);
  }

  sessionPath(): string {
    return join(this.workspaceDirectory(), "session.json");
  }

  workflowLogPath(): string {
    return join(this.workspaceDirectory(), "workflow.log");
  }

  workflowSummaryPath(): string {
    return join(this.workspaceDirectory(), "workflow.json");
  }

  reportPath(): string {
    return join(this.workspaceDirectory(), "report.json");
  }

  async initialize(): Promise<AuditSessionRecord> {
    await mkdir(this.workspaceDirectory(), {
      recursive: true
    });

    const existing = await this.read();
    const next: AuditSessionRecord =
      existing ?? {
        session: {
          id: this.options.sessionId,
          webUrl: this.options.webUrl,
          repoPath: this.options.repoPath,
          originalWorkflowId: this.options.workflowId,
          lastWorkflowId: this.options.workflowId,
          workflowIds: [this.options.workflowId],
          resumeAttempts: []
        },
        status: "running",
        workflowCount: 1,
        lastRunAt: this.now(),
        reportPath: null,
        metrics: {
          agents: {}
        }
      };

    if (existing) {
      next.status = "running";
      next.lastRunAt = this.now();
      next.session.lastWorkflowId = this.options.workflowId;

      if (!next.session.workflowIds.includes(this.options.workflowId)) {
        next.session.workflowIds.push(this.options.workflowId);
      }

      next.workflowCount = next.session.workflowIds.length;
    }

    await this.write(next);
    await this.appendLog(`[${this.now()}] [workflow] Initialized ${this.options.workflowId}`);
    return next;
  }

  async logPhaseStart(phase: string): Promise<void> {
    await this.appendLog(`[${this.now()}] [phase] START ${phase}`);
  }

  async logPhaseComplete(phase: string): Promise<void> {
    await this.appendLog(`[${this.now()}] [phase] COMPLETE ${phase}`);
  }

  async markAgentCompleted(input: {
    agentName: string;
    checkpointHash: string;
    deliverableFilename: string;
    metrics: PipelineAgentMetrics;
  }): Promise<void> {
    const session = await this.initialize();
    session.metrics.agents[input.agentName] = {
      status: "success",
      checkpoint: input.checkpointHash,
      deliverableFilename: input.deliverableFilename,
      metrics: input.metrics
    };
    await this.write(session);
    await this.logPhaseComplete(input.agentName);
  }

  async markAgentFailed(agentName: string, error: string): Promise<void> {
    const session = await this.initialize();
    session.metrics.agents[agentName] = {
      status: "failed"
    };
    session.status = "failed";
    session.lastRunAt = this.now();
    await this.write(session);
    await this.appendLog(`[${this.now()}] [agent] FAILED ${agentName}: ${error}`);
  }

  async addResumeAttempt(
    workflowId: string,
    supersededWorkflowIds: string[],
    checkpointHash: string
  ): Promise<void> {
    const session = await this.initialize();
    session.session.resumeAttempts.push({
      workflowId,
      supersededWorkflowIds,
      checkpointHash
    });
    session.session.lastWorkflowId = workflowId;

    if (!session.session.workflowIds.includes(workflowId)) {
      session.session.workflowIds.push(workflowId);
    }

    session.workflowCount = session.session.workflowIds.length;
    await this.write(session);
    await this.appendLog(
      `[${this.now()}] [workflow] RESUME ${workflowId} from ${checkpointHash}`
    );
  }

  async finalize(input: {
    status: AuditSessionRecord["status"];
    reportPath?: string;
  }): Promise<void> {
    const session = await this.initialize();
    session.status = input.status;
    session.lastRunAt = this.now();
    if (input.reportPath) {
      session.reportPath = input.reportPath;
    }
    await this.write(session);
    await this.appendLog(`[${this.now()}] [workflow] FINAL ${input.status}`);
  }

  async load(): Promise<AuditSessionRecord | null> {
    return this.read();
  }

  private async appendLog(line: string): Promise<void> {
    const existing = await this.readTextFile(this.workflowLogPath());
    const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(this.workflowLogPath(), `${existing}${prefix}${line}\n`, "utf8");
  }

  private async read(): Promise<AuditSessionRecord | null> {
    try {
      const raw = await readFile(this.sessionPath(), "utf8");
      return JSON.parse(raw) as AuditSessionRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  private async write(record: AuditSessionRecord): Promise<void> {
    await writeFile(this.sessionPath(), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  }

  private async readTextFile(path: string): Promise<string> {
    try {
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return "";
      }

      throw error;
    }
  }
}
