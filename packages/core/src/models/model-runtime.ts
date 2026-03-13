import type { ModelCapability, ModelCatalogEntry } from "@shannon/shared";

export interface ModelGenerationRequest {
  model: string;
  prompt: string;
  accessToken: string;
}

export interface ModelGenerationResult {
  outputText: string;
}

export interface ModelRuntime {
  generate(input: ModelGenerationRequest): Promise<ModelGenerationResult>;
}

export interface ModelGatewayOptions {
  runtime: ModelRuntime;
  catalog: ModelCatalogEntry[];
}

export interface ModelTaskRequest {
  capability: ModelCapability;
  prompt: string;
  accessToken: string;
}

