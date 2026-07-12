export declare const CLI_JSON_CONTRACT_VERSION = "2026-06-19";
/** Compare YYYY-MM-DD contract stamps; returns null when either side is unparsable. */
export declare function compareCalendarContractVersion(left: string, right: string): number | null;
export * from './intelligence';
export * from './repo-intelligence-v2';
export * from './proposed-change-validation';
export * from './status-vocabulary';
export * from './verification';
export * from './remediation';
export * from './admission';
export * from './pilot-funnel';
export * from './activation';
export * from './activation-journey';
export * from './first-value-proof';
export * from './pilot-setup';
export * from './manager-evidence';
export * from './governance-reality';
export * from './typescript-governance-quality-v1';
export * from './progressive-authority';
export * from './integrations-compatibility-v1';
export * from './runtime-risk-pack-v1';
export * from './runtime-policy-config';
export declare const RUNTIME_COMPATIBILITY_CONTRACT_ID = "neurcode-runtime-compatibility";
export declare const RUNTIME_COMPATIBILITY_CONTRACT_VERSION = "2026-04-04";
export declare const RUNTIME_COMPATIBILITY_MANIFEST_VERSION = "2026-06-19.1";
export declare const RUNTIME_COMPATIBILITY_MANIFEST_SCHEMA_VERSION = 1;
/**
 * Runtime Admission contract (Phase A — Provenance Core). Additive: surfaces a
 * version for the self-attested admission artifact + coverage manifest so the
 * future Action and backend can negotiate compatibility. No enforcement yet.
 */
export declare const ADMISSION_CONTRACT_ID = "neurcode-runtime-admission";
export declare const ADMISSION_CONTRACT_VERSION = "2026-06-02";
export type RuntimeComponent = 'cli' | 'action' | 'api';
export type RuntimeMinimumPeerVersions = Partial<Record<RuntimeComponent, string>>;
export interface RuntimeCompatibilityTriplet {
    id: string;
    channel: 'current' | 'support-floor' | 'compat-canary';
    versions: Record<RuntimeComponent, string>;
    notes?: string;
}
export interface RuntimeCompatibilityManifest {
    schemaVersion: number;
    manifestVersion: string;
    contractId: string;
    runtimeContractVersion: string;
    cliJsonContractVersion: string;
    /** Runtime Admission provenance contract version (additive; Phase A). */
    admissionContractVersion: string;
    minimumPeerVersions: Record<RuntimeComponent, RuntimeMinimumPeerVersions>;
    validatedTriplets: RuntimeCompatibilityTriplet[];
}
export declare function getRuntimeCompatibilityManifest(): RuntimeCompatibilityManifest;
export interface RuntimeCompatibilityDescriptor {
    contractId: string;
    runtimeContractVersion: string;
    cliJsonContractVersion: string;
    manifestVersion?: string;
    /** Runtime Admission provenance contract version (additive; optional for legacy peers). */
    admissionContractVersion?: string;
    component: RuntimeComponent;
    componentVersion: string;
    minimumPeerVersions: RuntimeMinimumPeerVersions;
}
export interface CliContractBase {
    contractVersion?: string;
    [key: string]: unknown;
}
export interface CliPlanJsonPayload extends CliContractBase {
    success: boolean;
    cached: boolean;
    mode: string;
    planId: string | null;
    sessionId: string | null;
    timestamp: string;
    message: string;
}
export interface CliApplyJsonPayload extends CliContractBase {
    success: boolean;
    planId: string;
    filesGenerated: number;
    files: unknown[];
    writtenFiles: unknown[];
    message: string;
}
export type VerifyVerdict = 'PASS' | 'WARN' | 'FAIL';
export type VerifySeverity = 'critical' | 'high' | 'warning' | 'info';
export interface VerifyOutputSummary {
    totalFilesChanged: number;
    totalViolations: number;
    totalWarnings: number;
    totalScopeIssues: number;
}
export interface VerifyOutputViolation {
    file: string;
    message: string;
    policy: string;
    severity: VerifySeverity;
}
export interface VerifyOutputWarning {
    file: string;
    message: string;
    policy: string;
}
export type VerifyScopeIssuePolicy = 'forbidden' | 'review-required' | 'out-of-scope' | 'generated-code' | 'unscoped';
export type VerifyScopeIssueBoundaryType = 'sensitive' | 'infra' | 'ci' | 'dependency-manifest' | 'service' | 'module' | 'generated-code' | 'unspecified';
export type VerifyImportEdgeKind = 'static' | 'relative' | 'dynamic' | 'require' | 'side-effect';
export type VerifyImportEdgeLanguage = 'python' | 'typescript' | 'javascript';
/**
 * Discriminator metadata attached to a scope issue when the breach was
 * detected through an import edge rather than a touched file path.
 * Present iff the scope issue originated from `evaluateImportEdgeGovernance`.
 */
export interface VerifyOutputImportEdge {
    sourceFile: string;
    sourceLine: number;
    importTarget: string;
    resolvedTargetPath: string;
    resolvedBoundary: string;
    edgeKind: VerifyImportEdgeKind;
    language: VerifyImportEdgeLanguage;
    deterministic: true;
    replayStable: true;
}
export interface VerifyOutputScopeIssue {
    file: string;
    message: string;
    /**
     * Severity / governance classification of the scope issue.
     * Optional for backward compatibility with pre-runtime-activation payloads.
     */
    policy?: VerifyScopeIssuePolicy;
    /**
     * Boundary category this file touched (when known). Optional so legacy
     * payloads remain valid.
     */
    boundaryType?: VerifyScopeIssueBoundaryType;
    /**
     * Set on issues raised by the deterministic import-edge governance layer
     * (an allowed source file importing from a forbidden boundary).
     */
    importEdge?: VerifyOutputImportEdge;
}
export interface VerifyOutput {
    verdict: VerifyVerdict;
    summary: VerifyOutputSummary;
    violations: VerifyOutputViolation[];
    warnings: VerifyOutputWarning[];
    scopeIssues: VerifyOutputScopeIssue[];
    driftScore?: number;
    /** Canonical governance model (additive; absent in legacy payloads). */
    governanceVerification?: import('./verification').GovernanceVerificationEnvelope;
    governanceFindings?: import('./verification').GovernanceFinding[];
}
export type CliVerifyJsonPayload = VerifyOutput;
export interface CliPromptJsonPayload extends CliContractBase {
    success: boolean;
    planId: string | null;
    intent: string | null;
    prompt: string | null;
    copied: boolean;
    outputPath: string | null;
    message: string;
}
export interface CliContractImportJsonPayload extends CliContractBase {
    success: boolean;
    provider: string | null;
    planId: string | null;
    sessionId: string | null;
    projectId: string | null;
    parseMode: 'json' | 'text' | null;
    importedFiles: number;
    sourcePath?: string | null;
    autoDetect?: Record<string, unknown> | null;
    warnings: unknown[];
    changeContract?: Record<string, unknown> | null;
    message: string;
    timestamp: string;
}
export interface CliShipJsonPayload extends CliContractBase {
    success: boolean;
    status: string;
    finalPlanId: string | null;
    audit?: Record<string, unknown>;
    error?: Record<string, unknown>;
}
export interface CliShipRunsJsonPayload extends CliContractBase {
    runs: unknown[];
}
export interface CliShipResumeJsonPayload extends CliContractBase {
    success: boolean;
    status: string;
    error?: Record<string, unknown>;
}
export interface CliShipAttestationVerifyJsonPayload extends CliContractBase {
    pass: boolean;
    message?: string;
    digest?: Record<string, unknown>;
}
export interface CliCompatJsonPayload extends CliContractBase {
    success: boolean;
    timestamp: string;
    component: 'cli';
    componentVersion: string;
    compatibility: RuntimeCompatibilityDescriptor;
}
export declare function compareSemver(left: string, right: string): number | null;
export declare function isSemverAtLeast(actual: string, minimum: string): boolean | null;
export declare function getMinimumCompatiblePeerVersion(component: RuntimeComponent, peer: RuntimeComponent): string | undefined;
export declare function getRuntimeMinimumPeerVersionMatrix(): Record<RuntimeComponent, RuntimeMinimumPeerVersions>;
export declare function buildRuntimeCompatibilityDescriptor(component: RuntimeComponent, componentVersion: string): RuntimeCompatibilityDescriptor;
export interface RuntimePeerCompatibilityIssue {
    component: RuntimeComponent;
    peer: RuntimeComponent;
    required: string;
    actual: string;
    code: 'UNPARSABLE_VERSION' | 'VERSION_BELOW_MINIMUM';
}
export declare function evaluateRuntimePeerCompatibility(versions: Record<RuntimeComponent, string>): RuntimePeerCompatibilityIssue[];
export declare function parseCliPlanJsonPayload(value: unknown, label?: string): CliPlanJsonPayload;
export declare function parseCliApplyJsonPayload(value: unknown, label?: string): CliApplyJsonPayload;
export declare function parseCliVerifyJsonPayload(value: unknown, label?: string): CliVerifyJsonPayload;
export declare function parseVerifyOutput(value: unknown, label?: string): VerifyOutput;
export declare function parseCliPromptJsonPayload(value: unknown, label?: string): CliPromptJsonPayload;
export declare function parseCliContractImportJsonPayload(value: unknown, label?: string): CliContractImportJsonPayload;
export declare function parseCliShipJsonPayload(value: unknown, label?: string): CliShipJsonPayload;
export declare function parseCliShipRunsJsonPayload(value: unknown, label?: string): CliShipRunsJsonPayload;
export declare function parseCliShipResumeJsonPayload(value: unknown, label?: string): CliShipResumeJsonPayload;
export declare function parseCliShipAttestationVerifyJsonPayload(value: unknown, label?: string): CliShipAttestationVerifyJsonPayload;
export declare function parseCliCompatJsonPayload(value: unknown, label?: string): CliCompatJsonPayload;
export * from './typescript-governance-quality-v14';
//# sourceMappingURL=index.d.ts.map