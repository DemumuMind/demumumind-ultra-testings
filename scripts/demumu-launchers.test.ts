import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..");

describe("demumu launchers", () => {
  test("root shell, PowerShell, and CMD launchers route into the CLI core", async () => {
    const [shellLauncher, powershellLauncher, cmdLauncher, cliPackage] = await Promise.all([
      readFile(join(repoRoot, "demumu"), "utf8"),
      readFile(join(repoRoot, "demumu.ps1"), "utf8"),
      readFile(join(repoRoot, "demumu.cmd"), "utf8"),
      readFile(join(repoRoot, "apps", "cli", "package.json"), "utf8")
    ]);

    expect(shellLauncher).toContain("apps/cli/dist/index.js");
    expect(powershellLauncher).toContain("apps\\cli\\dist\\index.js");
    expect(cmdLauncher).toContain("apps\\cli\\dist\\index.js");
    expect(cliPackage).toContain('"demumu"');
  });
});
