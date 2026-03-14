import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import {
  CapabilityRegistry,
  CcsCodexService,
  EnvironmentDoctor,
  ProjectBootstrapService,
  ProviderCatalogService,
  RunnerRegistry
} from "@shannon/core";
import type { WorkflowRuntimeClient } from "@shannon/worker";
import type {
  ProjectConfig,
  ProjectPolicy,
  TargetApplication,
  WorkspaceArtifactKind
} from "@shannon/shared";
import type { StateRepository } from "@shannon/core";

interface BuildServerOptions {
  stateRepository: StateRepository;
  ccsService: Pick<
    CcsCodexService,
    "getStatus" | "startOpenAiConnect" | "startDashboard" | "stopDashboard"
  >;
  workflowClient: WorkflowRuntimeClient;
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

function isWorkspaceArtifactKind(value: string): value is WorkspaceArtifactKind {
  return (
    value === "session" ||
    value === "workflow-summary" ||
    value === "workflow-log" ||
    value === "report-json" ||
    value === "final-report"
  );
}

export function buildServer(options: BuildServerOptions) {
  const server = Fastify({
    logger: false
  });
  const doctor = new EnvironmentDoctor({
    ccsService: options.ccsService
  });
  const providers = new ProviderCatalogService({
    ccsService: options.ccsService
  });
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
  server.get("/api/workflows", async () => options.workflowClient.getWorkflows());
  server.get("/api/workspaces", async () => options.workflowClient.getWorkspaces());
  server.get("/api/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const workspace = await options.workflowClient.getWorkspace(workspaceId).catch(() => undefined);

    if (!workspace) {
      return reply.status(404).send({
        error: "Workspace not found"
      });
    }

    return reply.send(workspace);
  });
  server.get("/api/workspaces/:workspaceId/artifacts/:artifactKind/preview", async (request, reply) => {
    const { workspaceId, artifactKind } = request.params as {
      workspaceId: string;
      artifactKind: string;
    };

    if (!isWorkspaceArtifactKind(artifactKind)) {
      return reply.status(400).send({
        error: "Unsupported artifact kind"
      });
    }

    const preview = await options.workflowClient
      .getWorkspaceArtifact(workspaceId, artifactKind)
      .catch(() => undefined);

    if (!preview) {
      return reply.status(404).send({
        error: "Artifact not found"
      });
    }

    return reply.send(preview);
  });
  server.get("/api/workspaces/:workspaceId/artifacts/:artifactKind/download", async (request, reply) => {
    const { workspaceId, artifactKind } = request.params as {
      workspaceId: string;
      artifactKind: string;
    };

    if (!isWorkspaceArtifactKind(artifactKind)) {
      return reply.status(400).send({
        error: "Unsupported artifact kind"
      });
    }

    const preview = await options.workflowClient
      .getWorkspaceArtifact(workspaceId, artifactKind)
      .catch(() => undefined);

    if (!preview) {
      return reply.status(404).send({
        error: "Artifact not found"
      });
    }

    reply.header(
      "content-disposition",
      `attachment; filename="${basename(preview.artifact.path)}"`
    );
    reply.type(preview.contentType);
    return reply.send(preview.content);
  });
  server.get("/api/runtime/health", async () => ({
    healthy: await options.workflowClient.checkRuntimeHealth(),
    mode: "temporal" as const
  }));
  server.get("/api/integrations/ccs/status", async () => options.ccsService.getStatus());
  server.post("/api/integrations/ccs/openai/connect", async () =>
    options.ccsService.startOpenAiConnect()
  );
  server.post("/api/integrations/ccs/dashboard/start", async () =>
    options.ccsService.startDashboard()
  );
  server.post("/api/integrations/ccs/dashboard/stop", async () =>
    options.ccsService.stopDashboard()
  );

  server.get("/api/workflows/:workflowId", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const detail = await options.workflowClient.getWorkflow(workflowId).catch(() => undefined);

    if (!detail) {
      return reply.status(404).send({
        error: "Workflow not found"
      });
    }

    return reply.send(detail);
  });

  server.get("/api/workflows/:workflowId/progress", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const progress = await options.workflowClient.getWorkflowProgress(workflowId).catch(() => undefined);

    if (!progress) {
      return reply.status(404).send({
        error: "Workflow not found"
      });
    }

    return reply.send(progress);
  });

  server.get("/api/workflows/:workflowId/logs", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const detail = await options.workflowClient.getWorkflowLogs(workflowId).catch(() => undefined);

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

  server.post("/api/workflows/:workflowId/stop", async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const workflow = await options.workflowClient.stopWorkflow(workflowId).catch(() => undefined);

    if (!workflow) {
      return reply.status(404).send({
        error: "Workflow not found"
      });
    }

    return reply.send(workflow);
  });

  server.post("/api/workflows/start", async (request, reply) => {
    try {
      const userId = requireStringField(request.body, "userId");
      const targetUrl = requireStringField(request.body, "url");
      const repo = requireStringField(request.body, "repo");
      const config =
        isRecord(request.body) && typeof request.body.config === "string" && request.body.config.trim()
          ? request.body.config
          : undefined;
      const output =
        isRecord(request.body) && typeof request.body.output === "string" && request.body.output.trim()
          ? request.body.output
          : undefined;
      const workspace =
        isRecord(request.body) && typeof request.body.workspace === "string" && request.body.workspace.trim()
          ? request.body.workspace.trim()
          : deriveWorkspaceName(targetUrl);
      const workflow = await options.workflowClient.startWorkflow({
        userId,
        url: targetUrl,
        repo,
        workspace,
        ...(config ? { config } : {}),
        ...(output ? { output } : {}),
        wait:
          isRecord(request.body) && typeof request.body.wait === "boolean"
            ? request.body.wait
            : undefined,
        pipelineTestingMode:
          isRecord(request.body) && typeof request.body.pipelineTestingMode === "boolean"
            ? request.body.pipelineTestingMode
            : undefined
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

  const legacyAuthReply = async (_request: unknown, reply: { status: (code: number) => { send: (payload: unknown) => unknown } }) =>
    reply.status(410).send({
      error:
        "Broker auth has been removed. Use /api/integrations/ccs/status and /api/integrations/ccs/openai/connect instead."
    });

  server.post("/api/auth/browser/start", legacyAuthReply);
  server.post("/api/auth/browser/callback", legacyAuthReply);
  server.post("/api/auth/device/start", legacyAuthReply);
  server.post("/api/auth/device/poll", legacyAuthReply);
  server.post("/api/auth/logout", legacyAuthReply);
  server.get("/api/auth/users/:userId/connection", legacyAuthReply);
  server.get("/api/auth/status/:userId", legacyAuthReply);

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

  server.get("/api/scans", async (_, reply) =>
    reply.status(410).send({
      error: "Legacy scan execution has been removed. Use /api/workflows/start instead."
    })
  );

  server.get("/api/scans/:scanRunId", async (_, reply) =>
    reply.status(410).send({
      error: "Legacy scan execution has been removed. Use /api/workflows/:workflowId instead."
    })
  );

  server.post("/api/scans", async (_, reply) =>
    reply.status(410).send({
      error: "Legacy scan execution has been removed. Use /api/workflows/start instead."
    })
  );

  server.get("/api/reports/:scanRunId", async (_, reply) =>
    reply.status(410).send({
      error: "Legacy report reads have been removed. Use /api/workflows/:workflowId instead."
    })
  );

  server.post("/api/runtime/stop", async (request) => {
    const clean =
      isRecord(request.body) && typeof request.body.clean === "boolean" ? request.body.clean : false;
    return options.workflowClient.stopRuntime({
      clean
    });
  });

  return server;
}
