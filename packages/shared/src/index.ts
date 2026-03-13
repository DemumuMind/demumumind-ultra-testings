import { z } from "zod";

export const attackDomainSchema = z.enum([
  "injection",
  "xss",
  "ssrf",
  "authentication",
  "authorization",
  "graphql",
  "business-logic"
]);

export const scanPhaseSchema = z.enum([
  "queued",
  "project-intake",
  "environment-doctor",
  "source-indexing",
  "recon-surface",
  "static-reasoning",
  "dynamic-validation",
  "reporting",
  "completed",
  "failed",
  "recon",
  "analysis",
  "exploitation"
]);

export const encryptionEnvelopeSchema = z.object({
  iv: z.string(),
  ciphertext: z.string(),
  authTag: z.string()
});

export const modelCapabilitySchema = z.enum([
  "reasoning",
  "tool-use-shell-orchestration",
  "browser-planning",
  "long-context-code-review",
  "structured-json-output"
]);

export const modelCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  capabilities: z.array(modelCapabilitySchema)
});

export const verificationModeSchema = z.enum(["passive", "simulation"]);
export const proofModeSchema = z.enum(["safe", "active", "destructive"]);
export const capabilityCategorySchema = z.enum(["core", "security", "tool-adapter"]);
export const capabilityPermissionSchema = z.enum(["safe", "active", "destructive"]);
export const providerKindSchema = z.enum(["openai", "nvidia"]);
export const providerStatusSchema = z.enum(["configured", "missing-key"]);
export const authStrategySchema = z.enum([
  "none",
  "browser-oauth",
  "device-auth",
  "manual"
]);
export const projectTargetKindSchema = z.enum([
  "web-app",
  "rest-api",
  "graphql-api",
  "hybrid-service"
]);
export const scanProfileSchema = z.enum(["white-box-web-api"]);
export const doctorCheckStatusSchema = z.enum(["pass", "warn", "fail", "info"]);
export const doctorReportStatusSchema = z.enum(["ready", "needs-attention"]);
export const coverageStatusSchema = z.enum([
  "supported",
  "partial",
  "planned",
  "not-supported"
]);
export const findingLifecycleStageSchema = z.enum([
  "signal",
  "hypothesis",
  "validation",
  "confirmed"
]);

export const providerDefinitionSchema = z.object({
  kind: providerKindSchema,
  label: z.string(),
  envKey: z.string(),
  baseUrl: z.string().url()
});

export const providerHealthSchema = providerDefinitionSchema.extend({
  status: providerStatusSchema
});

export const capabilityManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: capabilityCategorySchema,
  permissionLevel: capabilityPermissionSchema,
  enabledByDefault: z.boolean(),
  attackDomains: z.array(attackDomainSchema).default([])
});

export const projectPolicySchema = z.object({
  activeValidationAllowed: z.boolean(),
  destructiveChecksEnabled: z.boolean(),
  allowedExploitClasses: z.array(z.string())
});

export const projectAuthSchema = z.object({
  strategy: authStrategySchema,
  loginHints: z.array(z.string()).default([])
});

export const projectTargetSchema = z.object({
  kind: projectTargetKindSchema,
  baseUrl: z.string().url()
});

export const projectConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectRoot: z.string(),
  sourceRoots: z.array(z.string()).min(1),
  target: projectTargetSchema,
  auth: projectAuthSchema,
  scanProfile: scanProfileSchema,
  proofMode: proofModeSchema,
  providerPreferences: z.array(providerKindSchema).min(1),
  policy: projectPolicySchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const doctorCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: doctorCheckStatusSchema,
  summary: z.string(),
  remediation: z.string().optional()
});

export const doctorReportSchema = z.object({
  generatedAt: z.string().datetime(),
  status: doctorReportStatusSchema,
  platform: z.string(),
  checks: z.array(doctorCheckSchema)
});

export const coverageMatrixItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: coverageStatusSchema,
  proofType: proofModeSchema
});

export const exploitPackSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  attackDomain: attackDomainSchema,
  proofType: proofModeSchema,
  permissionLevel: capabilityPermissionSchema
});

export const runnerModeSchema = z.enum(["local", "attached"]);
export const runnerStatusSchema = z.enum(["ready", "busy", "offline"]);

export const runnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  mode: runnerModeSchema,
  status: runnerStatusSchema,
  endpoint: z.string().optional(),
  managed: z.boolean().default(false),
  lastSeenAt: z.string().datetime()
});

export const riskIndicatorSchema = z.object({
  domain: attackDomainSchema,
  filePath: z.string(),
  summary: z.string(),
  locationHint: z.string().nullable().optional()
});

export const phaseTransitionSchema = z.object({
  phase: scanPhaseSchema,
  changedAt: z.string().datetime()
});

export const reconArtifactSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  discoveredEndpoints: z.array(z.string()),
  discoveredViews: z.array(z.string()),
  authenticationSurface: z.array(z.string()),
  frameworkSignals: z.array(z.string()),
  sourceHighlights: z.array(
    z.object({
      filePath: z.string(),
      summary: z.string()
    })
  ),
  riskIndicators: z.array(riskIndicatorSchema).default([]),
  createdAt: z.string().datetime()
});

export const attackHypothesisSchema = z.object({
  id: z.string(),
  scanRunId: z.string(),
  domain: attackDomainSchema,
  title: z.string(),
  description: z.string(),
  evidence: z.array(z.string()),
  status: z.enum(["ready-for-exploitation", "discarded"])
});

export const exploitAttemptSchema = z.object({
  id: z.string(),
  scanRunId: z.string(),
  hypothesisId: z.string(),
  domain: attackDomainSchema,
  status: z.enum(["confirmed", "failed"]),
  proofOfConcept: z.string().nullable(),
  impactSummary: z.string(),
  evidenceArtifacts: z.array(z.string())
});

export const confirmedFindingSchema = z.object({
  id: z.string(),
  scanRunId: z.string(),
  attackDomain: attackDomainSchema,
  severity: z.enum(["critical", "high", "medium", "low"]),
  title: z.string(),
  affectedSurface: z.string(),
  codeLocation: z.string().nullable(),
  prerequisites: z.array(z.string()),
  proofOfConcept: z.string(),
  proofOfImpact: z.string(),
  rawEvidence: z.array(z.string()),
  reproductionStatus: z.enum(["confirmed", "replayed"]),
  lifecycleStage: findingLifecycleStageSchema.default("confirmed"),
  confidence: z.number().min(0).max(1).default(0.75),
  proofType: proofModeSchema.default("safe"),
  remediation: z.string().default("Review the affected flow and harden validation or access control."),
  unsupportedNotes: z.array(z.string()).default([])
});

export const reportSchema = z.object({
  id: z.string(),
  scanRunId: z.string(),
  findingIds: z.array(z.string()),
  generatedAt: z.string().datetime(),
  exploitPacks: z.array(exploitPackSummarySchema).default([]),
  coverageMatrix: z.array(coverageMatrixItemSchema).default([]),
  unsupportedClasses: z.array(z.string()).default([])
});

export const targetApplicationSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  sourceBundlePath: z.string(),
  verificationMode: verificationModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const scanRunSchema = z.object({
  id: z.string(),
  initiatedByUserId: z.string(),
  targetId: z.string(),
  projectId: z.string().nullable().optional(),
  sourceBundleId: z.string(),
  status: scanPhaseSchema,
  phaseHistory: z.array(phaseTransitionSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reconArtifactId: z.string().nullable(),
  reportId: z.string().nullable()
});

export type AttackDomain = z.infer<typeof attackDomainSchema>;
export type ScanPhase = z.infer<typeof scanPhaseSchema>;
export type EncryptionEnvelope = z.infer<typeof encryptionEnvelopeSchema>;
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;
export type VerificationMode = z.infer<typeof verificationModeSchema>;
export type ProofMode = z.infer<typeof proofModeSchema>;
export type CapabilityCategory = z.infer<typeof capabilityCategorySchema>;
export type CapabilityPermission = z.infer<typeof capabilityPermissionSchema>;
export type ProviderKind = z.infer<typeof providerKindSchema>;
export type ProviderDefinition = z.infer<typeof providerDefinitionSchema>;
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
export type ProjectPolicy = z.infer<typeof projectPolicySchema>;
export type ProjectAuth = z.infer<typeof projectAuthSchema>;
export type ProjectTarget = z.infer<typeof projectTargetSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;
export type DoctorReport = z.infer<typeof doctorReportSchema>;
export type CoverageMatrixItem = z.infer<typeof coverageMatrixItemSchema>;
export type ExploitPackSummary = z.infer<typeof exploitPackSummarySchema>;
export type Runner = z.infer<typeof runnerSchema>;
export type RiskIndicator = z.infer<typeof riskIndicatorSchema>;
export type PhaseTransition = z.infer<typeof phaseTransitionSchema>;
export type ReconArtifact = z.infer<typeof reconArtifactSchema>;
export type AttackHypothesis = z.infer<typeof attackHypothesisSchema>;
export type ExploitAttempt = z.infer<typeof exploitAttemptSchema>;
export type ConfirmedFinding = z.infer<typeof confirmedFindingSchema>;
export type Report = z.infer<typeof reportSchema>;
export type TargetApplication = z.infer<typeof targetApplicationSchema>;
export type ScanRun = z.infer<typeof scanRunSchema>;
