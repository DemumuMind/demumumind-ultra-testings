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
