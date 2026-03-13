import type { CapabilityManifest, CapabilityPermission } from "@shannon/shared";

const PERMISSION_ORDER: Record<CapabilityPermission, number> = {
  safe: 0,
  active: 1,
  destructive: 2
};

const CAPABILITIES: CapabilityManifest[] = [
  {
    id: "report-synthesis",
    name: "Report synthesis",
    description: "Correlates evidence into a transparent proof-first report.",
    category: "core",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: []
  },
  {
    id: "project-bootstrap",
    name: "Project bootstrap",
    description: "Creates project config, policies, and workspace defaults.",
    category: "core",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: []
  },
  {
    id: "code-indexing",
    name: "Code indexing",
    description: "Indexes source files and framework signals for white-box analysis.",
    category: "core",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "injection", "ssrf", "xss", "graphql"]
  },
  {
    id: "recon-surface-mapping",
    name: "Recon surface mapping",
    description: "Maps routes, handlers, GraphQL operations, and externally reachable surfaces.",
    category: "core",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "graphql", "business-logic"]
  },
  {
    id: "auth-flow-automation",
    name: "Auth flow automation",
    description: "Automates owned login, session bootstrap, and token acquisition flows for testing.",
    category: "core",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "business-logic"]
  },
  {
    id: "sast-lite",
    name: "SAST lite",
    description: "Applies lightweight static heuristics to security-relevant source patterns.",
    category: "security",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "injection", "ssrf", "xss", "graphql"]
  },
  {
    id: "secret-discovery",
    name: "Secret discovery",
    description: "Finds committed credentials, tokens, and sensitive configuration leaks.",
    category: "security",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: []
  },
  {
    id: "dependency-inventory",
    name: "Dependency inventory",
    description: "Builds a dependency inventory and highlights risky package surfaces for review.",
    category: "security",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["injection", "ssrf", "xss", "graphql"]
  },
  {
    id: "business-logic-heuristics",
    name: "Business logic heuristics",
    description: "Flags workflow abuse paths and state transitions that deserve active validation.",
    category: "security",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "business-logic", "graphql"]
  },
  {
    id: "safe-exploit-validation",
    name: "Safe exploit validation",
    description: "Runs non-destructive proof checks against owned targets.",
    category: "security",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "injection", "ssrf", "xss", "graphql"]
  },
  {
    id: "active-flow-replay",
    name: "Active flow replay",
    description: "Replays allowed authenticated flows with active validation.",
    category: "security",
    permissionLevel: "active",
    enabledByDefault: false,
    attackDomains: ["authentication", "authorization", "business-logic", "graphql"]
  },
  {
    id: "destructive-payload-lab",
    name: "Destructive payload lab",
    description: "Runs destructive payloads only when explicit policy and permissions allow it.",
    category: "security",
    permissionLevel: "destructive",
    enabledByDefault: false,
    attackDomains: ["injection", "ssrf", "business-logic"]
  },
  {
    id: "browser-automation",
    name: "Browser automation",
    description: "Controls browsers for authenticated proof and replay collection.",
    category: "tool-adapter",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "xss", "graphql"]
  },
  {
    id: "http-api-testing",
    name: "HTTP and API testing",
    description: "Executes managed REST and GraphQL requests against approved targets.",
    category: "tool-adapter",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "injection", "ssrf", "graphql"]
  },
  {
    id: "static-analyzer-adapter",
    name: "Static analyzer adapter",
    description: "Bridges external static analyzers into the correlated finding pipeline.",
    category: "tool-adapter",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["injection", "ssrf", "xss", "graphql"]
  },
  {
    id: "native-scanner-adapter",
    name: "Native scanner adapter",
    description: "Wraps native Windows scanner tools as managed capability packs.",
    category: "tool-adapter",
    permissionLevel: "safe",
    enabledByDefault: true,
    attackDomains: ["authentication", "authorization", "injection", "ssrf", "xss", "graphql"]
  }
];

export class CapabilityRegistry {
  list(input?: { maxPermission?: CapabilityPermission }): CapabilityManifest[] {
    if (!input?.maxPermission) {
      return [...CAPABILITIES];
    }

    const maxPermission = input.maxPermission;

    return CAPABILITIES.filter(
      (capability) => PERMISSION_ORDER[capability.permissionLevel] <= PERMISSION_ORDER[maxPermission]
    );
  }
}
