import type { ModelGenerationRequest, ModelGenerationResult, ModelRuntime } from "@shannon/core";

interface OpenAIResponseRuntimeOptions {
  apiBaseUrl: string;
}

export class OpenAIResponseRuntime implements ModelRuntime {
  constructor(private readonly options: OpenAIResponseRuntimeOptions) {}

  async generate(input: ModelGenerationRequest): Promise<ModelGenerationResult> {
    const response = await fetch(new URL("/responses", this.options.apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: input.model,
        input: input.prompt
      })
    });

    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
      output_text?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Model call failed with status ${response.status}`);
    }

    return {
      outputText: payload.output_text ?? ""
    };
  }
}

