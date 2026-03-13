import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

const rootDir = process.cwd();
const readmePath = path.join(rootDir, "README.md");
const packageJsonPath = path.join(rootDir, "package.json");

describe("public repository metadata", () => {
  test("README presents the product, quick start, and platform surfaces", async () => {
    const readme = await readFile(readmePath, "utf8");

    expect(readme).toContain("# DemumuMind Ultra Testings");
    expect(readme).toContain("Windows-first");
    expect(readme).toContain("Quick Start");
    expect(readme).toContain("demumumind /doctor");
    expect(readme).toContain("Desktop Shell");
    expect(readme).toContain("Web Control Plane");
    expect(readme).toContain("Safe Proof");
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
    };

    expect(packageJson.name).toBe("demumumind-ultra-testings");
    expect(packageJson.private).toBe(false);
    expect(packageJson.description).toContain("Windows-first");
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
  });
});
