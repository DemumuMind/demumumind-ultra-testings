import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CapabilityRegistry,
  CcsCodexService,
  EnvironmentDoctor,
  ProjectBootstrapService,
  ProviderCatalogService
} from "./index.js";

describe("DemumuMind runtime services", () => {
  test("reports Windows readiness and provider health for OpenAI and NVIDIA", async () => {
    const ccsService = {
      getStatus: async () => ({
        binaryReady: true,
        settingsPath: "C:/Users/demo/.ccs/codex.settings.json",
        profileConfigured: true,
        dashboardUrl: "http://localhost:3000",
        dashboardRunning: true,
        cliProxyRunning: true,
        callbackPort: 1455,
        callbackPortReady: true,
        localhostBindable: true,
        firewallStatus: "warn" as const,
        recentLogs: [],
        recommendedFixes: [
          'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455'
        ],
        activeProcess: "idle" as const
      })
    } satisfies Pick<CcsCodexService, "getStatus">;

    const doctor = new EnvironmentDoctor({
      env: {
        OPENAI_API_KEY: "sk-openai",
        NVIDIA_API_KEY: ""
      },
      platform: "win32",
      nodeVersion: "v22.14.0",
      powerShellVersion: "7.4.6",
      ccsService
    });

    const report = await doctor.inspect();
    const providers = await new ProviderCatalogService({
      env: {
        OPENAI_API_KEY: "sk-openai",
        NVIDIA_API_KEY: ""
      },
      ccsService
    }).list();
    const capabilities = new CapabilityRegistry().list({
      maxPermission: "safe"
    });

    expect(report.status).toBe("needs-attention");
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining([
        "windows-platform",
        "powershell",
        "node-runtime",
        "ccs-binary",
        "ccs-profile",
        "ccs-firewall"
      ])
    );
    expect(providers.find((provider) => provider.kind === "openai")?.status).toBe("configured");
    expect(providers.find((provider) => provider.kind === "nvidia")?.status).toBe("missing-key");
    expect(capabilities.some((capability) => capability.permissionLevel === "destructive")).toBe(
      false
    );
  });

  test("writes a project config and policy file for a new workspace", async () => {
    const directory = await mkdtemp(join(tmpdir(), "demumumind-bootstrap-"));

    try {
      const service = new ProjectBootstrapService();
      const result = await service.initializeProject({
        projectRoot: directory,
        name: "Demo Workspace",
        baseUrl: "http://localhost:3001",
        sourceRoots: [join(directory, "src")],
        providerPreferences: ["openai", "nvidia"]
      });

      const config = await readFile(result.configPath, "utf8");
      const policy = await readFile(result.policyPath, "utf8");

      expect(result.project.name).toBe("Demo Workspace");
      expect(result.configPath).toContain("demumumind.config.yaml");
      expect(config).toContain("proofMode: safe");
      expect(config).toContain("white-box-web-api");
      expect(policy).toContain("destructiveChecksEnabled: false");
    } finally {
      await rm(directory, {
        recursive: true,
        force: true
      });
    }
  });

  test("exposes deeper capability packs for white-box AppSec workflows", () => {
    const capabilities = new CapabilityRegistry().list();

    expect(capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
        "recon-surface-mapping",
        "auth-flow-automation",
        "sast-lite",
        "secret-discovery",
        "dependency-inventory",
        "business-logic-heuristics",
        "http-api-testing",
        "static-analyzer-adapter",
        "native-scanner-adapter"
      ])
    );
  });
});
