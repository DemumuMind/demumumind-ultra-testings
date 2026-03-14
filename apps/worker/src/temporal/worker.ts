#!/usr/bin/env node
import { bundleWorkflowCode, NativeConnection, Worker } from "@temporalio/worker";
import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as activities from "./activities.js";
import { TASK_QUEUE } from "./shared.js";

dotenv.config();

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export async function runWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "127.0.0.1:7233";
  const connection = await NativeConnection.connect({
    address
  });
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: join(currentDirectory, "workflows.js")
  });
  const worker = await Worker.create({
    connection,
    namespace: "default",
    workflowBundle,
    activities,
    taskQueue: TASK_QUEUE,
    maxConcurrentActivityTaskExecutions: 10
  });

  try {
    await worker.run();
  } finally {
    await connection.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runWorker().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
