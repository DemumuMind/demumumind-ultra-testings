import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodebaseReconService } from "./codebase-recon-service.js";

describe("CodebaseReconService", () => {
  test("extracts framework signals, routes, views, and risk indicators from source code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "shannon-recon-"));

    try {
      await mkdir(join(directory, "src", "routes"), {
        recursive: true
      });
      await mkdir(join(directory, "src", "components"), {
        recursive: true
      });

      await writeFile(
        join(directory, "src", "routes", "login.ts"),
        [
          "import express from 'express';",
          "const router = express.Router();",
          "router.post('/api/login', async (req, res) => {",
          "  const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;",
          "  res.json({ ok: true, query });",
          "});"
        ].join("\n")
      );
      await writeFile(
        join(directory, "src", "components", "UnsafeProfile.tsx"),
        [
          "export function UnsafeProfile({ html }) {",
          "  return <div dangerouslySetInnerHTML={{ __html: html }} />;",
          "}"
        ].join("\n")
      );

      const service = new CodebaseReconService();
      const artifact = await service.runRecon({
        scanRun: {
          id: "scan-1",
          initiatedByUserId: "user-1",
          targetId: "target-1",
          sourceBundleId: directory,
          status: "queued",
          phaseHistory: [],
          createdAt: "2026-03-13T12:00:00.000Z",
          updatedAt: "2026-03-13T12:00:00.000Z",
          reconArtifactId: null,
          reportId: null
        }
      });

      expect(artifact.frameworkSignals).toEqual(expect.arrayContaining(["express", "react"]));
      expect(artifact.discoveredEndpoints).toContain("/api/login");
      expect(artifact.discoveredViews).toContain("UnsafeProfile");
      expect(artifact.riskIndicators).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            domain: "injection",
            filePath: expect.stringContaining("login.ts")
          }),
          expect.objectContaining({
            domain: "xss",
            filePath: expect.stringContaining("UnsafeProfile.tsx")
          })
        ])
      );
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });
});

