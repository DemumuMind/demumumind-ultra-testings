import type { ProviderDefinition, ProviderHealth } from "@shannon/shared";

interface ProviderCatalogServiceOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}

export class ProviderCatalogService {
  private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined>;

  constructor(options: ProviderCatalogServiceOptions = {}) {
    this.env = options.env ?? process.env;
  }

  definitions(): ProviderDefinition[] {
    return [
      {
        kind: "openai",
        label: "OpenAI",
        envKey: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        authStrategies: ["browser-oauth", "device-auth", "manual"]
      },
      {
        kind: "nvidia",
        label: "NVIDIA",
        envKey: "NVIDIA_API_KEY",
        baseUrl: this.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
        authStrategies: ["browser-oauth", "device-auth", "manual"]
      }
    ];
  }

  list(): ProviderHealth[] {
    return this.definitions().map((provider) => ({
      ...provider,
      status: this.env[provider.envKey] ? "configured" : "missing-key"
    }));
  }
}
