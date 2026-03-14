import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CcsCodexService } from "./ccs-codex-service.js";

class FakeChildProcess extends EventEmitter {
  public readonly stdout = new PassThrough();
  public readonly stderr = new PassThrough();
  public killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit("exit", 0);
    return true;
  }
}

describe("CcsCodexService", () => {
  test("reports CCS readiness, profile configuration, dashboard health, and firewall remediation", async () => {
    const service = new CcsCodexService({
      homeDir: "C:/Users/demo",
      platform: "win32",
      detectBinary: async () => true,
      fileExists: async (path) => path.endsWith("codex.settings.json"),
      probeDashboard: async () => true,
      probeCliProxy: async () => true,
      checkCallbackPort: async () => true,
      checkLocalhostBinding: async () => true
    });

    const status = await service.getStatus();

    expect(status).toEqual(
      expect.objectContaining({
        binaryReady: true,
        profileConfigured: true,
        dashboardRunning: true,
        cliProxyRunning: true,
        callbackPort: 1455,
        callbackPortReady: true,
        localhostBindable: true,
        firewallStatus: "warn",
        activeProcess: "idle"
      })
    );
    expect(status.settingsPath).toContain(".ccs");
    expect(status.recommendedFixes).toContain(
      'netsh advfirewall firewall add rule name="CCS OAuth" dir=in action=allow protocol=TCP localport=1455'
    );
  });

  test("captures auth logs and marks the most recent managed process as succeeded", async () => {
    const children: FakeChildProcess[] = [];
    const service = new CcsCodexService({
      homeDir: "C:/Users/demo",
      platform: "win32",
      detectBinary: async () => true,
      fileExists: async () => false,
      probeDashboard: async () => false,
      probeCliProxy: async () => false,
      checkCallbackPort: async () => true,
      checkLocalhostBinding: async () => true,
      spawnProcess: async (input) => {
        expect(input.command).toBe("ccs");
        expect(input.args).toEqual(["codex", "--auth", "--add"]);
        const child = new FakeChildProcess();
        children.push(child);
        return child;
      }
    });

    await service.startOpenAiConnect();
    children[0]!.stdout.write("[OK] Browser opened\n");
    children[0]!.stderr.write("[..] Waiting for OAuth callback...\n");
    children[0]!.emit("exit", 0);

    const status = await service.getStatus();

    expect(status.activeProcess).toBe("succeeded");
    expect(status.recentLogs.join("\n")).toContain("Browser opened");
    expect(status.recentLogs.join("\n")).toContain("Waiting for OAuth callback");
  });

  test("starts and stops the managed CCS dashboard process while preserving external health probing", async () => {
    const child = new FakeChildProcess();
    let dashboardRunning = false;
    const service = new CcsCodexService({
      homeDir: "C:/Users/demo",
      platform: "win32",
      detectBinary: async () => true,
      fileExists: async () => false,
      probeDashboard: async () => dashboardRunning,
      probeCliProxy: async () => dashboardRunning,
      checkCallbackPort: async () => true,
      checkLocalhostBinding: async () => true,
      spawnProcess: async (input) => {
        expect(input.args).toEqual(["config"]);
        return child;
      }
    });

    await service.startDashboard();
    dashboardRunning = true;

    let status = await service.getStatus();
    expect(status.activeProcess).toBe("running");
    expect(status.dashboardRunning).toBe(true);
    expect(status.cliProxyRunning).toBe(true);

    await service.stopDashboard();
    dashboardRunning = false;

    status = await service.getStatus();
    expect(child.killed).toBe(true);
    expect(status.activeProcess).toBe("idle");
    expect(status.dashboardRunning).toBe(false);
  });
});
