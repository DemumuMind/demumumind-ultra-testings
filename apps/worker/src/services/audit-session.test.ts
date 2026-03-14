import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AuditSession } from "./audit-session.js";

describe("AuditSession", () => {
  test("initializes workspace artifacts and records agent completion", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-audit-"));

    try {
      const session = new AuditSession({
        auditRoot,
        sessionId: "demo-workspace",
        workflowId: "workflow-1",
        webUrl: "https://demo.test",
        repoPath: "C:/demo/repos/demo-app"
      });

      await session.initialize();
      await session.logPhaseStart("pre-recon");
      await session.markAgentCompleted({
        agentName: "pre-recon",
        checkpointHash: "abc123",
        deliverableFilename: "pre-recon.md",
        metrics: {
          durationMs: 1250,
          costUsd: 0.42,
          turns: 8,
          model: "gpt-4.1"
        }
      });

      const sessionPayload = JSON.parse(
        await readFile(join(auditRoot, "demo-workspace", "session.json"), "utf8")
      ) as {
        session: {
          id: string;
          originalWorkflowId: string;
        };
        metrics: {
          agents: Record<
            string,
            {
              status: string;
              checkpoint?: string;
              deliverableFilename?: string;
            }
          >;
        };
      };

      const workflowLog = await readFile(join(auditRoot, "demo-workspace", "workflow.log"), "utf8");

      expect(sessionPayload.session.id).toBe("demo-workspace");
      expect(sessionPayload.session.originalWorkflowId).toBe("workflow-1");
      expect(sessionPayload.metrics.agents["pre-recon"]).toEqual(
        expect.objectContaining({
          status: "success",
          checkpoint: "abc123",
          deliverableFilename: "pre-recon.md"
        })
      );
      expect(workflowLog).toContain("START pre-recon");
      expect(workflowLog).toContain("COMPLETE pre-recon");
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("records resume attempts on an existing workspace session", async () => {
    const auditRoot = await mkdtemp(join(tmpdir(), "shannon-audit-"));

    try {
      const session = new AuditSession({
        auditRoot,
        sessionId: "demo-workspace",
        workflowId: "workflow-1",
        webUrl: "https://demo.test",
        repoPath: "C:/demo/repos/demo-app"
      });

      await session.initialize();
      await session.addResumeAttempt("workflow-2", ["workflow-1"], "def456");

      const sessionPayload = JSON.parse(
        await readFile(join(auditRoot, "demo-workspace", "session.json"), "utf8")
      ) as {
        session: {
          resumeAttempts?: Array<{
            workflowId: string;
            supersededWorkflowIds: string[];
            checkpointHash: string;
          }>;
        };
      };

      expect(sessionPayload.session.resumeAttempts).toEqual([
        {
          workflowId: "workflow-2",
          supersededWorkflowIds: ["workflow-1"],
          checkpointHash: "def456"
        }
      ]);
    } finally {
      await rm(auditRoot, {
        recursive: true,
        force: true
      });
    }
  });
});
