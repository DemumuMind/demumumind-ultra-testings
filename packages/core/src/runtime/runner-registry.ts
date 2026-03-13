import { randomUUID } from "node:crypto";
import type { Runner } from "@shannon/shared";

export class RunnerRegistry {
  private readonly runners: Runner[];

  constructor(private readonly now: () => string = () => new Date().toISOString()) {
    this.runners = [
      {
        id: "local-runner",
        name: "Local DemumuMind Runner",
        mode: "local",
        status: "ready",
        endpoint: "http://127.0.0.1:4000/api",
        managed: true,
        lastSeenAt: this.now()
      }
    ];
  }

  list(): Runner[] {
    return this.runners.map((runner) => ({ ...runner }));
  }

  attach(input?: { name?: string; endpoint?: string }): Runner {
    const runner: Runner = {
      id: randomUUID(),
      name: input?.name?.trim() || "Attached Local Runner",
      mode: "attached",
      status: "ready",
      endpoint: input?.endpoint?.trim() || "http://127.0.0.1:4000/api",
      managed: false,
      lastSeenAt: this.now()
    };

    this.runners.push(runner);
    return { ...runner };
  }

  update(input: { id: string; status?: Runner["status"] }): Runner | null {
    const runner = this.runners.find((candidate) => candidate.id === input.id);

    if (!runner) {
      return null;
    }

    if (input.status) {
      runner.status = input.status;
    }

    runner.lastSeenAt = this.now();
    return { ...runner };
  }

  detach(id: string): boolean {
    const index = this.runners.findIndex((runner) => runner.id === id && !runner.managed);

    if (index === -1) {
      return false;
    }

    this.runners.splice(index, 1);
    return true;
  }
}
