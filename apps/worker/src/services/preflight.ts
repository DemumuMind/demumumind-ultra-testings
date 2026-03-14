import { existsSync } from "node:fs";

import { ensureGitRepository } from "./git-manager.js";

export async function runPreflightChecks(repoPath: string, configPath?: string): Promise<void> {
  await ensureGitRepository(repoPath);

  if (configPath && !existsSync(configPath)) {
    throw new Error(`Config path was not found: ${configPath}`);
  }
}
