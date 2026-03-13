import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { ProjectConfig, ProviderKind } from "@shannon/shared";

interface InitializeProjectInput {
  projectRoot: string;
  name: string;
  baseUrl: string;
  sourceRoots: string[];
  providerPreferences?: ProviderKind[];
}

interface InitializeProjectResult {
  project: ProjectConfig;
  configPath: string;
  policyPath: string;
}

function renderYamlLines(project: ProjectConfig): string[] {
  return [
    `id: ${project.id}`,
    `name: ${project.name}`,
    `projectRoot: ${project.projectRoot}`,
    "sourceRoots:",
    ...project.sourceRoots.map((sourceRoot) => `  - ${sourceRoot}`),
    "target:",
    `  kind: ${project.target.kind}`,
    `  baseUrl: ${project.target.baseUrl}`,
    "auth:",
    `  strategy: ${project.auth.strategy}`,
    "  loginHints:",
    ...project.auth.loginHints.map((hint) => `    - ${hint}`),
    `scanProfile: ${project.scanProfile}`,
    `proofMode: ${project.proofMode}`,
    "providerPreferences:",
    ...project.providerPreferences.map((provider) => `  - ${provider}`),
    "policy:",
    `  activeValidationAllowed: ${String(project.policy.activeValidationAllowed)}`,
    `  destructiveChecksEnabled: ${String(project.policy.destructiveChecksEnabled)}`,
    "  allowedExploitClasses:",
    ...project.policy.allowedExploitClasses.map((value) => `    - ${value}`),
    `createdAt: ${project.createdAt}`,
    `updatedAt: ${project.updatedAt}`
  ];
}

function renderPolicyLines(project: ProjectConfig): string[] {
  return [
    `projectId: ${project.id}`,
    `proofMode: ${project.proofMode}`,
    `activeValidationAllowed: ${String(project.policy.activeValidationAllowed)}`,
    `destructiveChecksEnabled: ${String(project.policy.destructiveChecksEnabled)}`,
    "allowedExploitClasses:",
    ...project.policy.allowedExploitClasses.map((value) => `  - ${value}`)
  ];
}

export class ProjectBootstrapService {
  async initializeProject(input: InitializeProjectInput): Promise<InitializeProjectResult> {
    const timestamp = new Date().toISOString();
    const project: ProjectConfig = {
      id: nanoid(),
      name: input.name,
      projectRoot: input.projectRoot,
      sourceRoots: input.sourceRoots,
      target: {
        kind: "web-app",
        baseUrl: input.baseUrl
      },
      auth: {
        strategy: "manual",
        loginHints: []
      },
      scanProfile: "white-box-web-api",
      proofMode: "safe",
      providerPreferences:
        input.providerPreferences && input.providerPreferences.length > 0
          ? input.providerPreferences
          : ["openai", "nvidia"],
      policy: {
        activeValidationAllowed: true,
        destructiveChecksEnabled: false,
        allowedExploitClasses: ["auth-safe", "read-only-http", "graphql-introspection"]
      },
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const policiesDirectory = join(input.projectRoot, "policies");
    const configPath = join(input.projectRoot, "demumumind.config.yaml");
    const policyPath = join(policiesDirectory, "default.yaml");

    await mkdir(policiesDirectory, {
      recursive: true
    });
    await Promise.all(
      project.sourceRoots.map((sourceRoot) =>
        mkdir(sourceRoot, {
          recursive: true
        })
      )
    );

    await writeFile(configPath, `${renderYamlLines(project).join("\n")}\n`, "utf8");
    await writeFile(policyPath, `${renderPolicyLines(project).join("\n")}\n`, "utf8");

    return {
      project,
      configPath,
      policyPath
    };
  }
}
