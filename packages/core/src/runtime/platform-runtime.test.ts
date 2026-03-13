import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CapabilityRegistry,
  EnvironmentDoctor,
  ProjectBootstrapService,
  ProviderCatalogService
} from "./index.js";

describe("DemumuMind runtime services", () => {
  test("reports Windows readiness and provider health for OpenAI and NVIDIA", async () => {
    const doctor = new EnvironmentDoctor({
      env: {
        OPENAI_API_KEY: "sk-openai",
        NVIDIA_API_KEY: ""
      },
      platform: "win32",
      nodeVersion: "v22.14.0",
      powerShellVersion: "7.4.6"
    });

    const report = await doctor.inspect();
    const providers = new ProviderCatalogService({
      env: {
        OPENAI_API_KEY: "sk-openai",
        NVIDIA_API_KEY: ""
      }
    }).list();
    const capabilities = new CapabilityRegistry().list({
      maxPermission: "safe"
    });

    expect(report.status).toBe("needs-attention");
    expect(report.checks.map((check) => check.id)).toEqual(
      expect.arrayContaining(["windows-platform", "powershell", "node-runtime"])
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
});
