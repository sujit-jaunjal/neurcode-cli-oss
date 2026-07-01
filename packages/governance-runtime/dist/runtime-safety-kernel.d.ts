/**
 * Runtime Safety Kernel V1 — enterprise runtime governance for AI coding agents.
 *
 * Neurcode is a runtime control plane, not a generic AppSec scanner. This module
 * classifies agent write attempts against sensitive runtime boundaries using
 * source-free, evidence-backed reason codes. Deterministic path rules are
 * separated from bounded inference and advisory signals.
 */
import { type IntentRedactionReasonCode } from './intent-privacy';
import type { OwnershipBoundary, SensitiveBoundary } from './profile';
export declare const RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION: "neurcode.runtime-safety-kernel.v1";
export declare const ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID: "enterprise_runtime_safety_v1";
/** Internal taxonomy — every classification maps to one primary family. */
export type RuntimeSafetyFamily = 'runtime_scope' | 'sensitive_surface' | 'credential_or_secret' | 'dependency_supply_chain' | 'auth_rbac_boundary' | 'migration_data_boundary' | 'infra_deploy_boundary' | 'test_or_verification_gap' | 'plan_drift' | 'approval_required_boundary';
export type RuntimeSafetyTruthTier = 'deterministic_fact' | 'bounded_inference' | 'advisory';
export type RuntimeSafetyEnforcementAction = 'allow' | 'warn' | 'approval_required' | 'block';
export type PlanControlMode = 'observe' | 'advise' | 'enforce_after_freeze';
export declare const DEFAULT_PLAN_CONTROL_MODE: PlanControlMode;
export type RuntimeSafetyPhase = 'planning' | 'implementation';
export interface RuntimeSafetyReasonCode {
    code: string;
    family: RuntimeSafetyFamily;
    truthTier: RuntimeSafetyTruthTier;
    message: string;
}
export interface RuntimeSafetyClassification {
    family: RuntimeSafetyFamily;
    reasonCodes: RuntimeSafetyReasonCode[];
    truthTier: RuntimeSafetyTruthTier;
    confidence: 'high' | 'medium' | 'low';
    enforcementEligible: boolean;
    deterministic: boolean;
}
export interface RuntimeSafetyClassifierInput {
    filePath: string;
    sensitiveBoundaries?: SensitiveBoundary[];
    ownershipBoundaries?: OwnershipBoundary[];
    approvalRequiredGlobs?: string[];
    sensitiveGlobs?: string[];
    allowedGlobs?: string[];
    approvedPaths?: string[];
    topologyPackageRoots?: string[];
}
export interface RuntimeSafetyClassifierResult {
    schemaVersion: typeof RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    filePath: string;
    classifications: RuntimeSafetyClassification[];
    primaryFamily: RuntimeSafetyFamily | null;
    inDeclaredScope: boolean;
    isApprovalRequired: boolean;
    hasExactApproval: boolean;
    hasLiteralExactApproval: boolean;
    neighborContainmentHolds: boolean;
}
export interface CredentialPreWriteEvidence {
    schemaVersion: typeof RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    filePath: string;
    detected: boolean;
    secretFamilies: IntentRedactionReasonCode[];
    redactionReason: string;
    localOnly: true;
    contentStored: false;
    matchCount: number;
    contentFingerprint: string | null;
}
export interface CredentialPreWriteResult {
    action: RuntimeSafetyEnforcementAction;
    evidence: CredentialPreWriteEvidence;
    message: string;
}
export type DependencyChangeKind = 'new_dependency' | 'version_upgrade' | 'version_downgrade' | 'script_lifecycle_risk' | 'lockfile_only_drift' | 'package_manager_config_change' | 'manifest_metadata_change';
export interface DependencyGovernanceEvidence {
    schemaVersion: typeof RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    filePath: string;
    manifestKind: 'npm' | 'pnpm' | 'yarn' | 'python' | 'cargo' | 'go' | 'other';
    changeKinds: DependencyChangeKind[];
    addedPackages: string[];
    removedPackages: string[];
    changedVersions: Array<{
        name: string;
        from: string | null;
        to: string | null;
    }>;
    scriptRiskSignals: string[];
    truthTier: RuntimeSafetyTruthTier;
}
export interface DependencyGovernanceResult {
    action: RuntimeSafetyEnforcementAction;
    evidence: DependencyGovernanceEvidence;
    message: string;
}
export interface RuntimeSafetyPolicyProfile {
    id: typeof ENTERPRISE_RUNTIME_SAFETY_V1_PROFILE_ID;
    schemaVersion: typeof RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    credentialWrites: RuntimeSafetyEnforcementAction;
    authRbac: RuntimeSafetyEnforcementAction;
    migrations: RuntimeSafetyEnforcementAction;
    dependencyManifests: RuntimeSafetyEnforcementAction;
    infraDeploy: RuntimeSafetyEnforcementAction;
    sensitiveSurfaces: RuntimeSafetyEnforcementAction;
    generatedFiles: RuntimeSafetyEnforcementAction;
    ordinaryFeatureFiles: RuntimeSafetyEnforcementAction;
    planMode: PlanControlMode;
}
export interface RuntimeSafetyEnforcementInput {
    classification: RuntimeSafetyClassifierResult;
    credential?: CredentialPreWriteResult | null;
    dependency?: DependencyGovernanceResult | null;
    policy: RuntimeSafetyPolicyProfile;
    phase: RuntimeSafetyPhase;
    planFiles?: string[];
}
export interface RuntimeSafetyEnforcementResult {
    action: RuntimeSafetyEnforcementAction;
    families: RuntimeSafetyFamily[];
    reasonCodes: string[];
    message: string;
    remediationCommand: string | null;
}
export interface RuntimeSafetySessionEvidence {
    schemaVersion: typeof RUNTIME_SAFETY_KERNEL_SCHEMA_VERSION;
    policyId: string;
    planMode: PlanControlMode;
    phase: RuntimeSafetyPhase;
    sourceUploaded: false;
    sensitiveSurfacesAttempted: string[];
    pathsBlocked: string[];
    pathsApproved: string[];
    neighborContainmentProof: Array<{
        approvedPath: string;
        deniedNeighbor: string;
    }>;
    dependencyChangesGoverned: number;
    credentialBlocksLocal: number;
    planDriftDetected: boolean;
    verificationGapNoted: boolean;
    classifications: Array<{
        filePath: string;
        family: RuntimeSafetyFamily;
        reasonCodes: string[];
        truthTier: RuntimeSafetyTruthTier;
        action: RuntimeSafetyEnforcementAction;
    }>;
}
export declare function classifyRuntimeSafetySurface(input: RuntimeSafetyClassifierInput): RuntimeSafetyClassifierResult;
export declare function evaluateNeighborContainment(approvedPath: string, candidatePath: string): {
    holds: boolean;
    approvedPath: string;
    deniedNeighbor: string;
};
export declare function evaluateCredentialPreWrite(input: {
    filePath: string;
    proposedContent?: string | null;
    policyAction?: RuntimeSafetyEnforcementAction;
}): CredentialPreWriteResult;
export declare function classifyDependencyManifestChange(input: {
    filePath: string;
    previousContent?: string | null;
    proposedContent?: string | null;
    policyAction?: RuntimeSafetyEnforcementAction;
}): DependencyGovernanceResult;
export declare const ENTERPRISE_RUNTIME_SAFETY_V1_POLICY: RuntimeSafetyPolicyProfile;
export declare function resolvePolicyActionForFamily(family: RuntimeSafetyFamily | null, policy: RuntimeSafetyPolicyProfile): RuntimeSafetyEnforcementAction;
export declare function resolvePolicyActionForClassification(classification: RuntimeSafetyClassifierResult, policy: RuntimeSafetyPolicyProfile): RuntimeSafetyEnforcementAction;
export declare function evaluatePlanControlMode(input: {
    planMode: PlanControlMode;
    phase: RuntimeSafetyPhase;
    classification: RuntimeSafetyClassifierResult;
    policy: RuntimeSafetyPolicyProfile;
    planFiles?: string[];
}): RuntimeSafetyEnforcementResult;
export declare function resolveRuntimeSafetyEnforcement(input: RuntimeSafetyEnforcementInput): RuntimeSafetyEnforcementResult;
export declare function buildRuntimeSafetySessionEvidence(input: {
    policy: RuntimeSafetyPolicyProfile;
    phase: RuntimeSafetyPhase;
    events: Array<{
        classification: RuntimeSafetyClassifierResult;
        enforcement: RuntimeSafetyEnforcementResult;
        credential?: CredentialPreWriteResult | null;
        dependency?: DependencyGovernanceResult | null;
    }>;
    approvedPaths?: string[];
    neighborProofs?: Array<{
        approvedPath: string;
        deniedNeighbor: string;
    }>;
}): RuntimeSafetySessionEvidence;
export declare function normalizePlanControlMode(value: unknown): PlanControlMode;
export type PlanControlModeEnforcement = 'records_only' | 'advisory' | 'blocks_after_freeze';
export interface PlanControlModeDescription {
    mode: PlanControlMode;
    /** One-line plain-language headline of how Neurcode participates. */
    headline: string;
    /** What happens to writes before the plan is frozen (planning phase). */
    planningPhase: string;
    /** What happens to writes after the plan is frozen (implementation phase). */
    afterFreeze: string;
    /** Coarse enforcement posture, for badges/labels. */
    enforcement: PlanControlModeEnforcement;
}
/**
 * Plain-language description of a {@link PlanControlMode}. This is the single
 * source of truth for honest plan-mode copy across CLI help, MCP tool output,
 * and docs — it mirrors exactly what {@link evaluatePlanControlMode} does, so
 * the words never drift from the behavior.
 *
 * Honesty notes baked into the copy:
 *  - Credential/secret writes are blocked locally in every mode (the credential
 *    guard is independent of plan phase), so each mode says so.
 *  - "Block" language is reserved for `enforce_after_freeze` after a freeze;
 *    `advise` escalates to exact-path approval, not a hard block, on sensitive
 *    surfaces.
 */
export declare function describePlanControlMode(mode: PlanControlMode): PlanControlModeDescription;
/** Action vocabulary for runtime-safety policy fields. */
export declare const RUNTIME_SAFETY_ENFORCEMENT_ACTIONS: readonly RuntimeSafetyEnforcementAction[];
/** Plan-control modes a policy may declare. */
export declare const PLAN_CONTROL_MODES: readonly PlanControlMode[];
/**
 * The per-family enforcement-action fields of a {@link RuntimeSafetyPolicyProfile}.
 * `credentialWrites` is included so the validator type-checks it like the rest,
 * but it is additionally pinned to `block` by the non-negotiable invariant below.
 */
export declare const RUNTIME_SAFETY_POLICY_ACTION_FIELDS: readonly ["credentialWrites", "authRbac", "migrations", "dependencyManifests", "infraDeploy", "sensitiveSurfaces", "generatedFiles", "ordinaryFeatureFiles"];
export type RuntimeSafetyPolicyActionField = (typeof RUNTIME_SAFETY_POLICY_ACTION_FIELDS)[number];
export interface RuntimeSafetyPolicyValidationResult {
    /**
     * Always a complete, safe profile. Invalid fields fall back to the enterprise
     * default; `credentialWrites` is always `block`.
     */
    policy: RuntimeSafetyPolicyProfile;
    /** Human-readable validation errors. Empty array means the input was fully valid. */
    errors: string[];
}
/**
 * Fail-closed validation for a partial runtime-safety policy override.
 *
 * Invariants:
 *  - Every action field must be one of allow|warn|approval_required|block.
 *  - `credentialWrites` MUST be `block` in every plan mode — credential/secret
 *    writes are blocked locally and cannot be weakened. Any other value is an
 *    error and is coerced back to `block`.
 *  - `planMode` must be observe|advise|enforce_after_freeze.
 *
 * The returned `policy` is always complete and safe: invalid fields keep the
 * enterprise default, so callers that ignore `errors` can never silently weaken
 * enforcement. Callers on validate/import paths MUST surface `errors` and reject.
 */
export declare function validateRuntimeSafetyPolicyProfile(input?: Partial<RuntimeSafetyPolicyProfile> | null): RuntimeSafetyPolicyValidationResult;
export declare function parseRuntimeSafetyPolicyProfile(input?: Partial<RuntimeSafetyPolicyProfile> | null): RuntimeSafetyPolicyProfile;
//# sourceMappingURL=runtime-safety-kernel.d.ts.map