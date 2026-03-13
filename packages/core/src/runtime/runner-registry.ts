import type { Runner } from "@shannon/shared";

export class RunnerRegistry {
  list(): Runner[] {
    return [
      {
        id: "local-runner",
        name: "Local DemumuMind Runner",
        mode: "local",
        status: "ready",
        endpoint: "http://127.0.0.1:4000/api"
      }
    ];
  }

  attach(name = "Attached Local Runner"): Runner {
    return {
      id: "attached-runner",
      name,
      mode: "attached",
      status: "ready",
      endpoint: "http://127.0.0.1:4000/api"
    };
  }
}
