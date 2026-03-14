export * from "./temporal/client.js";
export * from "./temporal/shared.js";

import { fileURLToPath } from "node:url";

import { runWorker } from "./temporal/worker.js";

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "worker") {
  runWorker().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
