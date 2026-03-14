import type { DoctorCheck, DoctorReport } from "@shannon/shared";
import type { CcsCodexService } from "./ccs-codex-service.js";
import { ProviderCatalogService } from "./provider-catalog.js";

interface EnvironmentDoctorOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  platform?: NodeJS.Platform | string;
  nodeVersion?: string;
  powerShellVersion?: string;
  now?: () => string;
  ccsService?: Pick<CcsCodexService, "getStatus">;
}

export class EnvironmentDoctor {
  private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined>;
  private readonly platform: NodeJS.Platform | string;
  private readonly nodeVersion: string;
  private readonly powerShellVersion: string | undefined;
  private readonly now: () => string;
  private readonly ccsService: Pick<CcsCodexService, "getStatus"> | undefined;

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
    this.ccsService = options.ccsService;
  }

  async inspect(): Promise<DoctorReport> {
    const ccsStatus = this.ccsService ? await this.ccsService.getStatus() : null;
    const providerChecks = (
      await new ProviderCatalogService({
        env: this.env,
        ccsService: this.ccsService
      }).list()
    )
      .map<DoctorCheck>((provider) => ({
        id: `${provider.kind}-provider`,
        label: `${provider.label} provider`,
        status: provider.status === "configured" ? "pass" : "warn",
        summary:
          provider.status === "configured"
            ? provider.kind === "openai" && ccsStatus?.profileConfigured
              ? `${provider.label} is configured through CCS Codex`
              : `${provider.label} API key detected`
            : `${provider.label} API key is missing`,
        remediation:
          provider.status === "configured"
            ? undefined
            : provider.kind === "openai"
              ? `Run \`ccs codex --auth --add\` or set ${provider.envKey} before running provider-backed scans.`
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
      {
        id: "ccs-binary",
        label: "CCS binary",
        status: ccsStatus?.binaryReady ? "pass" : "warn",
        summary: ccsStatus?.binaryReady
          ? "CCS is available in PATH"
          : "CCS was not detected in PATH",
        remediation: ccsStatus?.binaryReady
          ? undefined
          : "Install CCS and confirm that the `ccs` command is available."
      },
      {
        id: "ccs-profile",
        label: "CCS Codex profile",
        status: ccsStatus?.profileConfigured ? "pass" : "warn",
        summary: ccsStatus?.profileConfigured
          ? `CCS Codex profile detected at ${ccsStatus.settingsPath}`
          : "CCS Codex profile is not configured yet",
        remediation: ccsStatus?.profileConfigured
          ? undefined
          : "Run `ccs codex --auth --add` to configure OpenAI through CCS."
      },
      {
        id: "ccs-callback-port",
        label: "CCS callback port",
        status: ccsStatus?.callbackPortReady ? "pass" : "warn",
        summary: ccsStatus?.callbackPortReady
          ? `Port ${ccsStatus.callbackPort} is available for OAuth callbacks`
          : `Port ${ccsStatus?.callbackPort ?? 1455} is not available for OAuth callbacks`,
        remediation: ccsStatus?.callbackPortReady
          ? undefined
          : `Free port ${ccsStatus?.callbackPort ?? 1455} before running CCS OAuth.`
      },
      {
        id: "ccs-localhost-binding",
        label: "Localhost binding",
        status: ccsStatus?.localhostBindable ? "pass" : "warn",
        summary: ccsStatus?.localhostBindable
          ? "Can bind to localhost"
          : "Could not bind to localhost for CCS OAuth callback checks",
        remediation: ccsStatus?.localhostBindable
          ? undefined
          : "Check local firewall, antivirus, or proxy tooling that may block localhost listeners."
      },
      {
        id: "ccs-firewall",
        label: "Windows firewall",
        status:
          ccsStatus?.firewallStatus === "pass"
            ? "pass"
            : ccsStatus?.firewallStatus === "unknown"
              ? "info"
              : "warn",
        summary:
          ccsStatus?.firewallStatus === "pass"
            ? "Windows Firewall allows the CCS OAuth callback"
            : ccsStatus?.firewallStatus === "unknown"
              ? "Firewall verification is not available on this platform"
              : "Windows Firewall could not be verified for the CCS OAuth callback",
        remediation:
          ccsStatus?.firewallStatus === "warn"
            ? ccsStatus.recommendedFixes.find((fix) => fix.includes("netsh advfirewall")) ??
              "Add a firewall rule for the CCS OAuth callback port."
            : undefined
      },
      {
        id: "ccs-dashboard",
        label: "CCS dashboard",
        status: ccsStatus?.dashboardRunning ? "pass" : "info",
        summary: ccsStatus?.dashboardRunning
          ? `CCS dashboard is running at ${ccsStatus.dashboardUrl}`
          : `CCS dashboard is not running at ${ccsStatus?.dashboardUrl ?? "http://localhost:3000"}`,
        remediation: ccsStatus?.dashboardRunning ? undefined : "Run `ccs config` to start the dashboard."
      },
      {
        id: "ccs-cli-proxy",
        label: "CCS CLIProxy",
        status: ccsStatus?.cliProxyRunning ? "pass" : "info",
        summary: ccsStatus?.cliProxyRunning
          ? "CCS CLIProxy is reachable"
          : "CCS CLIProxy is not running",
        remediation: ccsStatus?.cliProxyRunning ? undefined : "Start `ccs config` to launch CLIProxy."
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
