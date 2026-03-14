import type { CcsCodexService } from "./ccs-codex-service.js";
import type { ProviderDefinition, ProviderHealth } from "@shannon/shared";

interface ProviderCatalogServiceOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  ccsService?: Pick<CcsCodexService, "getStatus">;
}

export class ProviderCatalogService {
  private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  private readonly ccsService: Pick<CcsCodexService, "getStatus"> | undefined;

  constructor(options: ProviderCatalogServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.ccsService = options.ccsService;
  }

  definitions(): ProviderDefinition[] {
    return [
      {
        kind: "openai",
        label: "OpenAI",
        envKey: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        authStrategies: ["ccs-codex", "manual"]
      },
      {
        kind: "nvidia",
        label: "NVIDIA",
        envKey: "NVIDIA_API_KEY",
        baseUrl: this.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
        authStrategies: ["manual"]
      }
    ];
  }

  async list(): Promise<ProviderHealth[]> {
    const ccsStatus = this.ccsService ? await this.ccsService.getStatus() : null;

    return this.definitions().map((provider) => ({
      ...provider,
      status:
        provider.kind === "openai"
          ? this.env[provider.envKey] || ccsStatus?.profileConfigured
            ? "configured"
            : "missing-key"
          : this.env[provider.envKey]
            ? "configured"
            : "missing-key"
    }));
  }
}
