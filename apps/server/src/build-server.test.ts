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

describe("buildServer", () => {
  test("supports browser login callback and connection lookup", async () => {
    const stateRepository = new InMemoryStateRepository();
    const provider = new FakeOAuthProviderClient();
    const authBroker = new OpenAIAuthBroker({
      provider,
      stateRepository,
      vault: new SecretVault({
        encryptionKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
      })
    });

    const server = buildServer({
      stateRepository,
      authBroker,
      scanOrchestrator: new ScanOrchestrator({
        stateRepository,
        reconService: new CodebaseReconService(),
        analyzers: [],
        exploiters: []
      })
    });

    try {
      const started = await server.inject({
        method: "POST",
        url: "/api/auth/browser/start",
        payload: {
          userId: "user-1",
          redirectUri: "http://127.0.0.1:1455/auth/callback"
        }
      });

      expect(started.statusCode).toBe(200);
      expect(started.json().authorizationUrl).toContain("state=test-state");
      expect(provider.lastRedirectUri).toBe("http://127.0.0.1:1455/auth/callback");

      const completed = await server.inject({
        method: "POST",
        url: "/api/auth/browser/callback",
        payload: {
          userId: "user-1",
          code: "returned-code",
          state: started.json().state
        }
      });

      expect(completed.statusCode).toBe(200);
      expect(completed.json().profile.email).toBe("server@example.com");

      const current = await server.inject({
        method: "GET",
        url: "/api/auth/users/user-1/connection"
      });

      expect(current.statusCode).toBe(200);
      expect(current.json().profile.name).toBe("Server User");
    } finally {
      await server.close();
    }
  });

  test("registers a target, runs a scan, and exposes the final report", async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), "shannon-server-source-"));

    try {
      await mkdir(join(sourceDirectory, "src", "routes"), {
        recursive: true
      });
      await writeFile(
        join(sourceDirectory, "src", "routes", "login.ts"),
        [
          "import express from 'express';",
          "const router = express.Router();",
          "router.post('/api/login', async (req, res) => {",
          "  const query = `SELECT * FROM users WHERE email = '${req.body.email}'`;",
          "  res.json({ ok: true, query });",
          "});"
        ].join("\n")
      );

      const stateRepository = new InMemoryStateRepository();
      const server = buildServer({
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
            new HeuristicDomainAnalyzer("authorization")
          ],
          exploiters: []
        })
      });

      try {
        const targetResponse = await server.inject({
          method: "POST",
          url: "/api/targets",
          payload: {
            name: "Demo app",
            baseUrl: "http://localhost:3001",
            sourceBundlePath: sourceDirectory,
            verificationMode: "simulation"
          }
        });

        expect(targetResponse.statusCode).toBe(201);

        const target = targetResponse.json();
        const scanResponse = await server.inject({
          method: "POST",
          url: "/api/scans",
          payload: {
            userId: "user-1",
            targetId: target.id
          }
        });

        expect(scanResponse.statusCode).toBe(201);
        expect(scanResponse.json().status).toBe("completed");

        const reportResponse = await server.inject({
          method: "GET",
          url: `/api/reports/${scanResponse.json().id}`
        });

        expect(reportResponse.statusCode).toBe(200);
        expect(reportResponse.json().report.findingIds.length).toBeGreaterThan(0);
        expect(reportResponse.json().findings[0].attackDomain).toBe("injection");
      } finally {
        await server.close();
      }
    } finally {
      await rm(sourceDirectory, {
        recursive: true,
        force: true
      });
    }
  });

  test("exposes doctor, providers, capabilities, runners, and project bootstrap endpoints", async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), "demumumind-server-project-"));

    try {
      const stateRepository = new InMemoryStateRepository();
      const server = buildServer({
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
          analyzers: [],
          exploiters: []
        })
      });

      try {
        const doctorResponse = await server.inject({
          method: "GET",
          url: "/api/bootstrap/doctor"
        });
        expect(doctorResponse.statusCode).toBe(200);
        expect(doctorResponse.json().checks.map((check: { id: string }) => check.id)).toEqual(
          expect.arrayContaining(["windows-platform", "powershell", "node-runtime"])
        );

        const providersResponse = await server.inject({
          method: "GET",
          url: "/api/providers"
        });
        expect(providersResponse.statusCode).toBe(200);
        expect(providersResponse.json().map((provider: { kind: string }) => provider.kind)).toEqual(
          expect.arrayContaining(["openai", "nvidia"])
        );

        const capabilitiesResponse = await server.inject({
          method: "GET",
          url: "/api/capabilities"
        });
        expect(capabilitiesResponse.statusCode).toBe(200);
        expect(
          capabilitiesResponse.json().some((capability: { id: string }) => capability.id === "report-synthesis")
        ).toBe(true);

        const projectResponse = await server.inject({
          method: "POST",
          url: "/api/projects/init",
          payload: {
            projectRoot: workspaceDirectory,
            name: "Server Project",
            baseUrl: "http://localhost:3001",
            sourceRoots: [join(workspaceDirectory, "src")]
          }
        });
        expect(projectResponse.statusCode).toBe(201);
        expect(projectResponse.json().configPath).toContain("demumumind.config.yaml");

        const projectsResponse = await server.inject({
          method: "GET",
          url: "/api/projects"
        });
        expect(projectsResponse.statusCode).toBe(200);
        expect(projectsResponse.json()[0].name).toBe("Server Project");

        const runnersResponse = await server.inject({
          method: "GET",
          url: "/api/runners"
        });
        expect(runnersResponse.statusCode).toBe(200);
        expect(runnersResponse.json()[0].mode).toBe("local");
      } finally {
        await server.close();
      }
    } finally {
      await rm(workspaceDirectory, {
        recursive: true,
        force: true
      });
    }
  });

  test("runs a scan from a bootstrapped project and preserves safe-proof reporting", async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), "demumumind-project-scan-"));

    try {
      await mkdir(join(workspaceDirectory, "src"), {
        recursive: true
      });
      await writeFile(
        join(workspaceDirectory, "src", "resolver.ts"),
        [
          "export const typeDefs = `type Query { ping: String }`;",
          "export const resolvers = {",
          "  Query: {",
          "    schema: () => '__schema introspection'",
          "  }",
          "};"
        ].join("\n")
      );

      const stateRepository = new InMemoryStateRepository();
      const server = buildServer({
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
            new HeuristicDomainAnalyzer("graphql"),
            new HeuristicDomainAnalyzer("injection")
          ],
          exploiters: []
        })
      });

      try {
        const projectResponse = await server.inject({
          method: "POST",
          url: "/api/projects/init",
          payload: {
            projectRoot: workspaceDirectory,
            name: "GraphQL Project",
            baseUrl: "http://localhost:4100",
            sourceRoots: [join(workspaceDirectory, "src")]
          }
        });
        expect(projectResponse.statusCode).toBe(201);

        const scanResponse = await server.inject({
          method: "POST",
          url: "/api/scans",
          payload: {
            userId: "user-1",
            projectId: projectResponse.json().project.id
          }
        });

        expect(scanResponse.statusCode).toBe(201);
        expect(scanResponse.json().status).toBe("completed");

        const reportResponse = await server.inject({
          method: "GET",
          url: `/api/reports/${scanResponse.json().id}`
        });

        expect(reportResponse.statusCode).toBe(200);
        expect(reportResponse.json().findings[0].attackDomain).toBe("graphql");
        expect(reportResponse.json().findings[0].proofType).toBe("safe");
      } finally {
        await server.close();
      }
    } finally {
      await rm(workspaceDirectory, {
        recursive: true,
        force: true
      });
    }
  });

  test("exposes auth status and supports reading and updating project policy", async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), "demumumind-policy-project-"));

    try {
      const stateRepository = new InMemoryStateRepository();
      const authBroker = new OpenAIAuthBroker({
        provider: new FakeOAuthProviderClient(),
        stateRepository,
        vault: new SecretVault({
          encryptionKey: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
        })
      });
      const server = buildServer({
        stateRepository,
        authBroker,
        scanOrchestrator: new ScanOrchestrator({
          stateRepository,
          reconService: new CodebaseReconService(),
          analyzers: [],
          exploiters: []
        })
      });

      try {
        const started = await server.inject({
          method: "POST",
          url: "/api/auth/device/start",
          payload: {
            userId: "policy-user"
          }
        });

        const polled = await server.inject({
          method: "POST",
          url: "/api/auth/device/poll",
          payload: {
            userId: "policy-user",
            sessionId: started.json().sessionId
          }
        });

        expect(polled.statusCode).toBe(200);

        const projectResponse = await server.inject({
          method: "POST",
          url: "/api/projects/init",
          payload: {
            projectRoot: workspaceDirectory,
            name: "Policy Project",
            baseUrl: "http://localhost:3001",
            sourceRoots: [join(workspaceDirectory, "src")]
          }
        });
        const projectId = projectResponse.json().project.id as string;

        const authStatus = await server.inject({
          method: "GET",
          url: "/api/auth/status/policy-user"
        });
        expect(authStatus.statusCode).toBe(200);
        expect(authStatus.json().connected).toBe(true);

        const policyResponse = await server.inject({
          method: "GET",
          url: `/api/projects/${projectId}/policy`
        });
        expect(policyResponse.statusCode).toBe(200);
        expect(policyResponse.json().destructiveChecksEnabled).toBe(false);

        const updatedPolicy = await server.inject({
          method: "PATCH",
          url: `/api/projects/${projectId}/policy`,
          payload: {
            activeValidationAllowed: true,
            destructiveChecksEnabled: true,
            allowedExploitClasses: ["auth-safe", "graphql-introspection", "destructive-lab"]
          }
        });
        expect(updatedPolicy.statusCode).toBe(200);
        expect(updatedPolicy.json().destructiveChecksEnabled).toBe(true);
        expect(updatedPolicy.json().allowedExploitClasses).toContain("destructive-lab");
      } finally {
        await server.close();
      }
    } finally {
      await rm(workspaceDirectory, {
        recursive: true,
        force: true
      });
    }
  });

  test("supports auth logout and richer runner lifecycle management", async () => {
    const stateRepository = new InMemoryStateRepository();
    const authBroker = new OpenAIAuthBroker({
      provider: new FakeOAuthProviderClient(),
      stateRepository,
      vault: new SecretVault({
        encryptionKey: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd"
      })
    });
    const server = buildServer({
      stateRepository,
      authBroker,
      scanOrchestrator: new ScanOrchestrator({
        stateRepository,
        reconService: new CodebaseReconService(),
        analyzers: [],
        exploiters: []
      })
    });

    try {
      const started = await server.inject({
        method: "POST",
        url: "/api/auth/device/start",
        payload: {
          userId: "runner-user"
        }
      });

      const polled = await server.inject({
        method: "POST",
        url: "/api/auth/device/poll",
        payload: {
          userId: "runner-user",
          sessionId: started.json().sessionId
        }
      });

      expect(polled.statusCode).toBe(200);

      const attachedRunner = await server.inject({
        method: "POST",
        url: "/api/runners/attach",
        payload: {
          name: "Lab Runner",
          endpoint: "http://127.0.0.1:4310/api"
        }
      });

      expect(attachedRunner.statusCode).toBe(201);
      expect(attachedRunner.json().name).toBe("Lab Runner");
      expect(attachedRunner.json().endpoint).toBe("http://127.0.0.1:4310/api");
      expect(attachedRunner.json().managed).toBe(false);
      expect(attachedRunner.json().lastSeenAt).toMatch(/^2026|20/);

      const updatedRunner = await server.inject({
        method: "PATCH",
        url: `/api/runners/${attachedRunner.json().id}`,
        payload: {
          status: "busy"
        }
      });

      expect(updatedRunner.statusCode).toBe(200);
      expect(updatedRunner.json().status).toBe("busy");

      const listedRunners = await server.inject({
        method: "GET",
        url: "/api/runners"
      });

      expect(listedRunners.statusCode).toBe(200);
      expect(listedRunners.json().some((runner: { name: string }) => runner.name === "Lab Runner")).toBe(true);
      expect(listedRunners.json()[0].managed).toBe(true);

      const logoutResponse = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        payload: {
          userId: "runner-user"
        }
      });

      expect(logoutResponse.statusCode).toBe(204);

      const authStatus = await server.inject({
        method: "GET",
        url: "/api/auth/status/runner-user"
      });

      expect(authStatus.statusCode).toBe(200);
      expect(authStatus.json().connected).toBe(false);

      const detachedRunner = await server.inject({
        method: "DELETE",
        url: `/api/runners/${attachedRunner.json().id}`
      });

      expect(detachedRunner.statusCode).toBe(204);

      const runnersAfterDetach = await server.inject({
        method: "GET",
        url: "/api/runners"
      });

      expect(
        runnersAfterDetach.json().some((runner: { name: string }) => runner.name === "Lab Runner")
      ).toBe(false);
    } finally {
      await server.close();
    }
  });
});
