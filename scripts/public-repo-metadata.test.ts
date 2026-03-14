import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const rootDir = process.cwd();
const readmePath = path.join(rootDir, "README.md");
const packageJsonPath = path.join(rootDir, "package.json");

describe("public repository metadata", () => {
  test("README presents the Shannon-style product, quick start, and platform surfaces", async () => {
    const readme = await readFile(readmePath, "utf8");

    expect(readme).toContain("# Demumu Shannon");
    expect(readme).toContain("Shannon-style workflow runner");
    expect(readme).toContain("CLI-first");
    expect(readme).toContain("Quick Start");
    expect(readme).toContain("git clone https://github.com/DemumuMind/demumumind-ultra-testings.git");
    expect(readme).toContain("corepack enable");
    expect(readme).toContain("pnpm install");
    expect(readme).toContain("pnpm build");
    expect(readme).toContain("automatically boots the local Temporal runtime");
    expect(readme).toContain("DEMUMUMIND_SERVER_BOOTSTRAP_COMMAND");
    expect(readme).toContain("./demumu login --provider openai");
    expect(readme).toContain("./demumu config");
    expect(readme).toContain("CCS Codex");
    expect(readme).toContain('netsh advfirewall firewall add rule name="CCS OAuth"');
    expect(readme).toContain("./demumu start URL=https://example.com REPO=repo-name");
    expect(readme).toContain("./demumu logs ID=<workflow-id>");
    expect(readme).toContain("./demumu query ID=<workflow-id>");
    expect(readme).toContain("PowerShell");
    expect(readme).toContain("CMD");
    expect(readme).toContain("Git Bash / Shell");
    expect(readme).toContain("WSL");
    expect(readme).toContain("OpenAI");
    expect(readme).toContain("NVIDIA");
    expect(readme).toContain("Rust is intentionally deferred");
  });

  test("package metadata is ready for a public repository", async () => {
    const packageJsonRaw = await readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw) as {
      name?: string;
      private?: boolean;
      description?: string;
      license?: string;
      repository?: { type?: string; url?: string };
      bugs?: { url?: string };
      homepage?: string;
      keywords?: string[];
      scripts?: Record<string, string>;
    };

    expect(packageJson.name).toBe("demumumind-ultra-testings");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toContain("AppSec");
    expect(packageJson.license).toBe("MIT");
    expect(packageJson.repository).toEqual({
      type: "git",
      url: "https://github.com/DemumuMind/demumumind-ultra-testings.git"
    });
    expect(packageJson.bugs).toEqual({
      url: "https://github.com/DemumuMind/demumumind-ultra-testings/issues"
    });
    expect(packageJson.homepage).toBe(
      "https://github.com/DemumuMind/demumumind-ultra-testings#readme"
    );
    expect(packageJson.keywords).toEqual(
      expect.arrayContaining([
        "appsec",
        "pentesting",
        "security-testing",
        "windows",
        "typescript"
      ])
    );
    expect(packageJson.scripts).toMatchObject({
      cli: "node ./apps/cli/dist/index.js",
      "cli:dev": "pnpm --filter @shannon/cli dev",
      doctor: "node ./apps/cli/dist/index.js doctor"
    });
  });
});
