import type { ModelCatalogEntry } from "@shannon/shared";

export function loadModelCatalog(): ModelCatalogEntry[] {
  const raw = process.env.SHANNON_MODEL_CATALOG_JSON;

  if (raw) {
    return JSON.parse(raw) as ModelCatalogEntry[];
  }

  return [
    {
      id: "gpt-5",
      label: "Reasoning",
      capabilities: ["reasoning", "structured-json-output"]
    },
    {
      id: "gpt-5-codex",
      label: "Codex Operator",
      capabilities: ["tool-use-shell-orchestration", "browser-planning", "long-context-code-review"]
    }
  ];
}

