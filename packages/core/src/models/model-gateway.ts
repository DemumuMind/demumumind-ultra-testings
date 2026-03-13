import type { ModelCatalogEntry } from "@shannon/shared";
import type { ModelGatewayOptions, ModelTaskRequest } from "./model-runtime.js";

export class ModelGateway {
  constructor(private readonly options: ModelGatewayOptions) {}

  async runTask(input: ModelTaskRequest) {
    const model = this.selectModel(input.capability);

    if (!model) {
      throw new Error(`No configured model supports capability "${input.capability}"`);
    }

    return this.options.runtime.generate({
      model: model.id,
      prompt: input.prompt,
      accessToken: input.accessToken
    });
  }

  private selectModel(capability: ModelTaskRequest["capability"]): ModelCatalogEntry | undefined {
    return this.options.catalog.find((entry) => entry.capabilities.includes(capability));
  }
}

