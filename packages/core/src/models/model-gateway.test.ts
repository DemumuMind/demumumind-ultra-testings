import { ModelGateway } from "./model-gateway.js";
import type { ModelRuntime } from "./model-runtime.js";

describe("ModelGateway", () => {
  test("routes tasks to the first model that satisfies the requested capability", async () => {
    const captured: Array<{ model: string; prompt: string; accessToken: string }> = [];
    const runtime: ModelRuntime = {
      async generate(input) {
        captured.push(input);
        return {
          outputText: `model:${input.model}`
        };
      }
    };

    const gateway = new ModelGateway({
      runtime,
      catalog: [
        {
          id: "gpt-reporter",
          label: "Reporter",
          capabilities: ["structured-json-output"]
        },
        {
          id: "gpt-reasoner",
          label: "Reasoner",
          capabilities: ["reasoning", "long-context-code-review"]
        },
        {
          id: "codex-operator",
          label: "Codex Operator",
          capabilities: ["tool-use-shell-orchestration", "browser-planning"]
        }
      ]
    });

    const response = await gateway.runTask({
      capability: "tool-use-shell-orchestration",
      prompt: "Plan an exploit verification attempt",
      accessToken: "oauth-access-token"
    });

    expect(response.outputText).toBe("model:codex-operator");
    expect(captured).toEqual([
      {
        model: "codex-operator",
        prompt: "Plan an exploit verification attempt",
        accessToken: "oauth-access-token"
      }
    ]);
  });

  test("fails clearly when no model supports the requested capability", async () => {
    const gateway = new ModelGateway({
      runtime: {
        async generate() {
          return {
            outputText: "unused"
          };
        }
      },
      catalog: [
        {
          id: "gpt-reporter",
          label: "Reporter",
          capabilities: ["structured-json-output"]
        }
      ]
    });

    await expect(
      gateway.runTask({
        capability: "browser-planning",
        prompt: "Open the target and map the login flow",
        accessToken: "oauth-access-token"
      })
    ).rejects.toThrow(/no configured model supports capability/i);
  });
});

