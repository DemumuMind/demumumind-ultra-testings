import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CliSession {
  userId: string;
}

export async function loadSession(sessionFilePath: string): Promise<CliSession | null> {
  try {
    const raw = await readFile(sessionFilePath, "utf8");
    return JSON.parse(raw) as CliSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function saveSession(sessionFilePath: string, session: CliSession): Promise<void> {
  await mkdir(dirname(sessionFilePath), {
    recursive: true
  });
  await writeFile(sessionFilePath, JSON.stringify(session, null, 2), "utf8");
}

export async function clearSession(sessionFilePath: string): Promise<void> {
  await rm(sessionFilePath, {
    force: true
  });
}

