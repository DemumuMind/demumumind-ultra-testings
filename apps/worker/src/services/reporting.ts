import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Report } from "@shannon/shared";

export async function assembleFinalReport(repoPath: string, workflowId: string): Promise<{
  report: Report;
  reportPath: string;
}> {
  const deliverablesDirectory = join(repoPath, "deliverables");
  const reportPath = join(deliverablesDirectory, "comprehensive_security_assessment_report.md");
  const entries = await safeReadDir(deliverablesDirectory);
  const markdownFiles = entries
    .filter((entry) => entry.endsWith(".md") && entry !== "comprehensive_security_assessment_report.md")
    .sort();

  const sections = await Promise.all(
    markdownFiles.map(async (entry) => {
      const content = await readFile(join(deliverablesDirectory, entry), "utf8");
      return `## ${entry}\n\n${content.trim()}`;
    })
  );

  await mkdir(deliverablesDirectory, {
    recursive: true
  });
  await writeFile(
    reportPath,
    `# Shannon-Like Security Assessment\n\nWorkflow: ${workflowId}\n\n${sections.join("\n\n")}\n`,
    "utf8"
  );

  return {
    report: {
      id: `${workflowId}-report`,
      scanRunId: workflowId,
      findingIds: [],
      generatedAt: new Date().toISOString(),
      exploitPacks: [],
      coverageMatrix: [],
      unsupportedClasses: []
    },
    reportPath
  };
}

async function safeReadDir(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
