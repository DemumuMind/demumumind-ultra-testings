import type { DoctorCheck, DoctorReport } from "@shannon/shared";
import { ProviderCatalogService } from "./provider-catalog.js";

interface EnvironmentDoctorOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform | string;
  nodeVersion?: string;
  powerShellVersion?: string;
  now?: () => string;
}

export class EnvironmentDoctor {
  private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  private readonly platform: NodeJS.Platform | string;
  private readonly nodeVersion: string;
  private readonly powerShellVersion: string | undefined;
  private readonly now: () => string;

  constructor(options: EnvironmentDoctorOptions = {}) {
    this.env = options.env ?? process.env;
    this.platform = options.platform ?? process.platform;
    this.nodeVersion = options.nodeVersion ?? process.version;
    this.powerShellVersion =
      options.powerShellVersion ??
      this.env.PSVersion ??
      this.env.PWSH_VERSION ??
      this.env.POWERSHELL_VERSION;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async inspect(): Promise<DoctorReport> {
    const providerChecks = new ProviderCatalogService({
      env: this.env
    })
      .list()
      .map<DoctorCheck>((provider) => ({
        id: `${provider.kind}-provider`,
        label: `${provider.label} provider`,
        status: provider.status === "configured" ? "pass" : "warn",
        summary:
          provider.status === "configured"
            ? `${provider.label} API key detected`
            : `${provider.label} API key is missing`,
        remediation:
          provider.status === "configured"
            ? undefined
            : `Set ${provider.envKey} before running provider-backed scans.`
      }));

    const checks: DoctorCheck[] = [
      {
        id: "windows-platform",
        label: "Windows platform",
        status: this.platform === "win32" ? "pass" : "warn",
        summary:
          this.platform === "win32"
            ? "Windows native runtime is supported"
            : `Detected ${this.platform}; Windows-first runtime features may be limited`,
        remediation:
          this.platform === "win32"
            ? undefined
            : "Use Windows for the intended native-only bootstrap path."
      },
      {
        id: "powershell",
        label: "PowerShell",
        status: this.powerShellVersion ? "pass" : "warn",
        summary: this.powerShellVersion
          ? `PowerShell ${this.powerShellVersion} is available`
          : "PowerShell version could not be detected",
        remediation: this.powerShellVersion
          ? undefined
          : "Install PowerShell 7+ or expose its version to the runtime."
      },
      {
        id: "node-runtime",
        label: "Node runtime",
        status: "pass",
        summary: `Detected ${this.nodeVersion}`
      },
      ...providerChecks
    ];

    return {
      generatedAt: this.now(),
      status: checks.some((check) => check.status === "warn" || check.status === "fail")
        ? "needs-attention"
        : "ready",
      platform: this.platform,
      checks
    };
  }
}
