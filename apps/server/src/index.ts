import { CcsCodexService, FileStateRepository } from "@shannon/core";
import { TemporalPipelineClient } from "@shannon/worker";
import { buildServer } from "./build-server.js";

const dataDirectory = process.env.SHANNON_DATA_DIR ?? "./data";
const resolvedDataDirectory = process.env.DEMUMUMIND_DATA_DIR ?? dataDirectory;
const stateRepository = new FileStateRepository({
  dataDirectory: resolvedDataDirectory
});
const workflowClient = new TemporalPipelineClient({
  auditRoot: process.env.DEMUMUMIND_AUDIT_ROOT,
  address: process.env.TEMPORAL_ADDRESS,
  namespace: process.env.TEMPORAL_NAMESPACE,
  projectRoot: process.cwd()
});
const ccsService = new CcsCodexService();

const server = buildServer({
  stateRepository,
  ccsService,
  workflowClient
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

await server.listen({
  port,
  host
});

console.log(`DemumuMind daemon listening on http://${host}:${port}`);
console.log(`DemumuMind daemon data dir: ${resolvedDataDirectory}`);
