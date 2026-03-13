import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodebaseReconService,
  HeuristicDomainAnalyzer,
  InMemoryStateRepository,
  OpenAIAuthBroker,
  ScanOrchestrator,
  SecretVault
} from "@shannon/core";
import { buildServer } from "./build-server.js";
import type {
  BrowserAuthStartResult,
  DeviceAuthorizationResult,
  OAuthProviderClient,
  OAuthTokenSet,
  UserProfile
} from "@shannon/core";

class FakeOAuthProviderClient implements OAuthProviderClient {
  public lastRedirectUri: string | undefined;

  buildAuthorizationUrl(input?: { redirectUri?: string }): BrowserAuthStartResult {
    this.lastRedirectUri = input?.redirectUri;
    return {
      authorizationUrl: "https://auth.example.test/authorize?state=test-state",
      codeVerifier: "browser-verifier",
      state: "test-state"
    };
  }

  async exchangeAuthorizationCode(): Promise<OAuthTokenSet> {
    return {
      accessToken: "server-access-token",
      refreshToken: "server-refresh-token",
      expiresAt: "2026-03-13T18:00:00.000Z",
      scope: "openid profile email"
    };
  }

  async fetchUserProfile(): Promise<UserProfile> {
    return {
      providerUserId: "provider-user-1",
      email: "server@example.com",
      name: "Server User"
    };
  }

  async startDeviceAuthorization(): Promise<DeviceAuthorizationResult> {
    return {
      deviceCode: "device-code-1",
      userCode: "ABCD-EFGH",
      verificationUri: "https://auth.example.test/device",
      expiresInSeconds: 900,
      intervalSeconds: 1
    };
  }

  async pollDeviceAuthorization(): Promise<OAuthTokenSet | null> {
    return {
      accessToken: "server-access-token",
      refreshToken: "server-refresh-token",
      expiresAt: "2026-03-13T18:00:00.000Z",
      scope: "openid profile email"
    };
  }
}

function createServer() {
  const stateRepository = new InMemoryStateRepository();
  return buildServer({
    stateRepository,
    authBroker: new OpenAIAuthBroker({
      provider: new FakeOAuthProviderClient(),
      stateRepository,
      vault: new SecretVault({
        encryptionKey: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      })
    }),
    scanOrchestrator: new ScanOrchestrator({
      stateRepository,
      reconService: new CodebaseReconService(),
      analyzers: [
        new HeuristicDomainAnalyzer("injection"),
        new HeuristicDomainAnalyzer("xss"),
        new HeuristicDomainAnalyzer("ssrf"),
        new HeuristicDomainAnalyzer("authentication"),
        new HeuristicDomainAnalyzer("authorization"),
        new HeuristicDomainAnalyzer("graphql"),
        new HeuristicDomainAnalyzer("business-logic")
      ],
      exploiters: []
    })
  });
}

describe("buildServer", () => {
  test("keeps only OpenAI and NVIDIA providers and advertises browser/device auth first", async () => {
    const server = createServer();

    try {
      const response = await server.inject({
        method: "GET",
        url: "/api/providers"
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        expect.objectContaining({
          kind: "openai",
          authStrategies: ["browser-oauth", "device-auth", "manual"]
        }),
        expect.objectContaining({
          kind: "nvidia",
          authStrategies: ["browser-oauth", "device-auth", "manual"]
        })
      ]);
    } finally {
      await server.close();
    }
  });

  test("starts a workflow and exposes dashboard-ready workflow, logs, and workspace data", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "demumu-workflow-"));
    const reposRoot = join(workspaceRoot, "repos");
    const repoDirectory = join(reposRoot, "demo-app");
    const sourceDirectory = join(repoDirectory, "src", "routes");
    const outputDirectory = join(workspaceRoot, "audit-logs");

    await mkdir(sourceDirectory, {
      recursive: true
    });
    await writeFile(
      join(sourceDirectory, "login.ts"),
      [
        "import express from 'express';",
        "const router = express.Router();",
        "router.post('/api/login', async (req, res) => {",
        "  const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;",
        "  res.json({ ok: true, query });",
        "});"
      ].join("\n")
    );
    await writeFile(join(repoDirectory, ".git"), "gitdir: /fake/demo-app\n");

    const originalCwd = process.cwd();
    process.chdir(workspaceRoot);

    const server = createServer();

    try {
      const started = await server.inject({
        method: "POST",
        url: "/api/workflows/start",
        payload: {
          userId: "user-1",
          url: "http://localhost:3001",
          repo: "demo-app",
          workspace: "demo-workspace",
          output: outputDirectory
        }
      });

      expect(started.statusCode).toBe(201);
      expect(started.json()).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          status: "completed",
          targetUrl: "http://localhost:3001",
          workspace: "demo-workspace",
          repoPath: repoDirectory,
          currentPhase: "completed",
          reportPath: expect.stringContaining("audit-logs")
        })
      );
      expect(started.json().durationMs).toBeGreaterThanOrEqual(0);
      expect(started.json().totalTurns).toBeGreaterThan(0);
      expect(started.json().agentCount).toBeGreaterThan(0);
      expect(started.json().agentBreakdown.length).toBeGreaterThan(0);

      const workflows = await server.inject({
        method: "GET",
        url: "/api/workflows"
      });
      expect(workflows.statusCode).toBe(200);
      expect(workflows.json()[0].workspace).toBe("demo-workspace");

      const detail = await server.inject({
        method: "GET",
        url: `/api/workflows/${started.json().id}`
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().workflow.id).toBe(started.json().id);
      expect(detail.json().report.findingIds.length).toBeGreaterThan(0);

      const logs = await server.inject({
        method: "GET",
        url: `/api/workflows/${started.json().id}/logs`
      });
      expect(logs.statusCode).toBe(200);
      expect(logs.json().logs[0]).toContain("Workflow created");

      const workspaces = await server.inject({
        method: "GET",
        url: "/api/workspaces"
      });
      expect(workspaces.statusCode).toBe(200);
      expect(workspaces.json()).toEqual([
        expect.objectContaining({
          name: "demo-workspace",
          lastWorkflowId: started.json().id,
          workflowCount: 1,
          targetUrl: "http://localhost:3001"
        })
      ]);
    } finally {
      process.chdir(originalCwd);
      await server.close();
      await rm(workspaceRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test("stops the local runtime and supports clean data removal", async () => {
    const server = createServer();

    try {
      const response = await server.inject({
        method: "POST",
        url: "/api/runtime/stop",
        payload: {
          clean: true
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "stopped",
        clean: true,
        message: "Removed workflow data"
      });
    } finally {
      await server.close();
    }
  });
});
