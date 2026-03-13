import { readFile } from "node:fs/promises";
import { join } from "node:path";

const installScriptPath = join(process.cwd(), "scripts", "windows", "install-demumumind.ps1");
const packageScriptPath = join(process.cwd(), "scripts", "windows", "package-desktop.ps1");

describe("Windows installer UX scripts", () => {
  test("installer exposes staged UX helpers and desktop/runtime options", async () => {
    const script = await readFile(installScriptPath, "utf8");

    expect(script).toContain("[switch]$BuildDesktop");
    expect(script).toContain("[switch]$LaunchDaemon");
    expect(script).toContain("[switch]$NonInteractive");
    expect(script).toContain("function Write-Step");
    expect(script).toContain("function Get-Decision");
    expect(script).toContain("function Show-DoctorSummary");
    expect(script).toContain("Bootstrap complete");
  });

  test("desktop packaging script exposes portable/install options and final summary", async () => {
    const script = await readFile(packageScriptPath, "utf8");

    expect(script).toContain("[switch]$PortableOnly");
    expect(script).toContain("[switch]$SkipInstall");
    expect(script).toContain("[switch]$NonInteractive");
    expect(script).toContain("function Write-Step");
    expect(script).toContain("function Get-Decision");
    expect(script).toContain("Packaging complete");
  });
});
