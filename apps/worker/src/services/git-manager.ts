import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    windowsHide: true
  });
  return stdout.trim();
}

export async function ensureGitRepository(repoPath: string): Promise<void> {
  if (!existsSync(repoPath) || !existsSync(`${repoPath}/.git`)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }
}

export async function createGitCheckpoint(repoPath: string, agentName: string): Promise<string> {
  await ensureGitRepository(repoPath);
  await runGit(["add", "-A"], repoPath);

  try {
    await runGit(["commit", "--allow-empty", "-m", `chore: checkpoint ${agentName}`], repoPath);
  } catch (error) {
    if (!String(error).includes("nothing to commit")) {
      throw error;
    }
  }

  return runGit(["rev-parse", "HEAD"], repoPath);
}

export async function restoreGitCheckpoint(repoPath: string, checkpointHash: string): Promise<void> {
  await ensureGitRepository(repoPath);
  await runGit(["reset", "--hard", checkpointHash], repoPath);
  await runGit(["clean", "-fd"], repoPath);
}
