import {
  CodebaseReconService,
  FileStateRepository,
  HeuristicDomainAnalyzer,
  ModelGateway,
  OpenAIAuthBroker,
  ScanOrchestrator,
  SecretVault
} from "@shannon/core";
import type { AttackDomain } from "@shannon/shared";
import { buildServer } from "./build-server.js";
import { loadModelCatalog } from "./load-model-catalog.js";
import { DemoOAuthProviderClient, ConfiguredOAuthProviderClient } from "./oauth-provider-client.js";
import { OpenAIResponseRuntime } from "./openai-response-runtime.js";

const dataDirectory = process.env.SHANNON_DATA_DIR ?? "./data";
const resolvedDataDirectory = process.env.DEMUMUMIND_DATA_DIR ?? dataDirectory;
const encryptionKey =
  process.env.DEMUMUMIND_ENCRYPTION_KEY ??
  process.env.SHANNON_ENCRYPTION_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const stateRepository = new FileStateRepository({
  dataDirectory: resolvedDataDirectory
});
const oauthProvider =
  process.env.SHANNON_OAUTH_AUTHORIZATION_URL &&
  process.env.SHANNON_OAUTH_TOKEN_URL &&
  process.env.SHANNON_OAUTH_DEVICE_URL &&
  process.env.SHANNON_OAUTH_USERINFO_URL &&
  process.env.SHANNON_OAUTH_CLIENT_ID &&
  process.env.SHANNON_OAUTH_REDIRECT_URI
    ? new ConfiguredOAuthProviderClient({
        authorizationUrl: process.env.SHANNON_OAUTH_AUTHORIZATION_URL,
        tokenUrl: process.env.SHANNON_OAUTH_TOKEN_URL,
        deviceAuthorizationUrl: process.env.SHANNON_OAUTH_DEVICE_URL,
        userInfoUrl: process.env.SHANNON_OAUTH_USERINFO_URL,
        clientId: process.env.SHANNON_OAUTH_CLIENT_ID,
        redirectUri: process.env.SHANNON_OAUTH_REDIRECT_URI,
        scope: process.env.SHANNON_OAUTH_SCOPE ?? "openid profile email"
      })
    : new DemoOAuthProviderClient();

const authBroker = new OpenAIAuthBroker({
  provider: oauthProvider,
  stateRepository,
  vault: new SecretVault({
    encryptionKey
  })
});

const attackDomains: AttackDomain[] = [
  "injection",
  "xss",
  "ssrf",
  "authentication",
  "authorization",
  "graphql",
  "business-logic"
];

const modelGateway = new ModelGateway({
  runtime: new OpenAIResponseRuntime({
    apiBaseUrl:
      process.env.DEMUMUMIND_OPENAI_API_BASE_URL ??
      process.env.SHANNON_OPENAI_API_BASE_URL ??
      "https://api.openai.com/v1"
  }),
  catalog: loadModelCatalog()
});

void modelGateway;

const scanOrchestrator = new ScanOrchestrator({
  stateRepository,
  reconService: new CodebaseReconService(),
  analyzers: attackDomains.map((domain) => new HeuristicDomainAnalyzer(domain)),
  exploiters: []
});

const server = buildServer({
  stateRepository,
  authBroker,
  scanOrchestrator
});

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";

await server.listen({
  port,
  host
});

console.log(`DemumuMind daemon listening on http://${host}:${port}`);
console.log(`DemumuMind daemon data dir: ${resolvedDataDirectory}`);
