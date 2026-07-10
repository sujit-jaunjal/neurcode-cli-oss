/**
 * Neurcode Runtime Policy Manifest (Iteration 13 — Enterprise Policy Builder).
 *
 * A source-free, portable representation of a repository's runtime-safety
 * governance: boundary globs + plan mode + the runtime-safety policy enums.
 * This is the export/import format behind `neurcode governance export|import`
 * and the dashboard Runtime Policy Builder. It carries NO source, diffs, prompts,
 * secrets, or repository file contents — only governance configuration.
 *
 * This module is intentionally dependency-free (no Node globals, no governance
 * runtime import) so it can run unchanged in the CLI and in the browser dashboard.
 * The enum vocabularies mirror the canonical Runtime Safety Kernel; the harness
 * asserts round-trip equivalence so the two surfaces cannot drift.
 *
 * Non-negotiable invariant: `runtimeSafetyPolicy.credentialWrites` is ALWAYS
 * `block`. The parser fail-closes — credential weakening, unknown enum values,
 * unknown fields, or malformed shapes are reported as errors AND coerced to the
 * safe default, so a caller that ignores `errors` can never silently weaken
 * enforcement.
 */
export declare const NEURCODE_RUNTIME_POLICY_MANIFEST_ID: "neurcode.policy.runtime.v1";
/** Enforcement vocabulary — mirrors the kernel `RuntimeSafetyEnforcementAction`. */
export declare const RUNTIME_POLICY_ENFORCEMENT_ACTIONS: readonly ["allow", "warn", "approval_required", "block"];
export type RuntimePolicyEnforcementAction = (typeof RUNTIME_POLICY_ENFORCEMENT_ACTIONS)[number];
/** Plan-control modes — mirrors the kernel `PlanControlMode`. */
export declare const RUNTIME_POLICY_PLAN_MODES: readonly ["observe", "advise", "enforce_after_freeze"];
export type RuntimePolicyPlanMode = (typeof RUNTIME_POLICY_PLAN_MODES)[number];
/** Tri-state posture used by plan-coherence and duplicate-symbol checks. */
export declare const RUNTIME_POLICY_TRISTATE_MODES: readonly ["off", "warn", "block"];
export type RuntimePolicyTristateMode = (typeof RUNTIME_POLICY_TRISTATE_MODES)[number];
/**
 * The runtime-safety policy enums carried by the manifest. Mirrors the kernel
 * `RuntimeSafetyPolicyProfile` action fields (id/schemaVersion are intentionally
 * omitted — they are authoritative kernel constants, never configured here).
 */
export interface RuntimePolicySafetyProfile {
    /** Invariant: credential/secret writes are blocked in every plan mode. */
    credentialWrites: 'block';
    authRbac: RuntimePolicyEnforcementAction;
    migrations: RuntimePolicyEnforcementAction;
    dependencyManifests: RuntimePolicyEnforcementAction;
    infraDeploy: RuntimePolicyEnforcementAction;
    sensitiveSurfaces: RuntimePolicyEnforcementAction;
    generatedFiles: RuntimePolicyEnforcementAction;
    ordinaryFeatureFiles: RuntimePolicyEnforcementAction;
    planMode: RuntimePolicyPlanMode;
}
export interface RuntimePolicyManifest {
    manifestId: typeof NEURCODE_RUNTIME_POLICY_MANIFEST_ID;
    /** Additive approval-required boundary globs (never remove detected boundaries). */
    approvalRequiredGlobs: string[];
    /** Additive sensitive-surface globs. */
    sensitiveGlobs: string[];
    /** Globs treated as safe support surfaces. */
    safeSupportGlobs: string[];
    /** Globs excluded from governance entirely. */
    ignoredGlobs: string[];
    /** Repo plan-control mode (kept consistent with runtimeSafetyPolicy.planMode). */
    planMode: RuntimePolicyPlanMode;
    /** Plan-coherence posture. */
    planCoherence: RuntimePolicyTristateMode;
    /** Duplicate repo-symbol posture. */
    repoSymbolDuplicateMode: RuntimePolicyTristateMode;
    runtimeSafetyPolicy: RuntimePolicySafetyProfile;
}
export interface RuntimePolicyManifestParseResult {
    /**
     * Always a complete, safe manifest. Invalid fields fall back to the enterprise
     * default; `runtimeSafetyPolicy.credentialWrites` is always `block`.
     */
    manifest: RuntimePolicyManifest;
    /** Human-readable validation errors. Empty array means the input was fully valid. */
    errors: string[];
}
/** Enterprise-default runtime-safety policy enums (mirrors ENTERPRISE_RUNTIME_SAFETY_V1_POLICY). */
export declare const DEFAULT_RUNTIME_POLICY_SAFETY_PROFILE: RuntimePolicySafetyProfile;
/** Enterprise-default manifest with no extra boundary globs configured. */
export declare const DEFAULT_RUNTIME_POLICY_MANIFEST: RuntimePolicyManifest;
export declare function isRuntimePolicyEnforcementAction(value: unknown): value is RuntimePolicyEnforcementAction;
export declare function isRuntimePolicyPlanMode(value: unknown): value is RuntimePolicyPlanMode;
/** Normalize a single glob the same way the CLI reader does (stable round-trips). */
export declare function normalizeRuntimePolicyGlob(value: string): string;
/**
 * Hand-rolled, fail-closed parser for a {@link RuntimePolicyManifest}. Always
 * returns a complete, safe manifest plus a list of validation errors. Callers on
 * the import path MUST reject when `errors` is non-empty.
 */
export declare function parseRuntimePolicyManifest(value: unknown): RuntimePolicyManifestParseResult;
/** Build a manifest from already-validated parts, normalizing globs and pinning the credential invariant. */
export declare function buildRuntimePolicyManifest(input: {
    approvalRequiredGlobs?: string[];
    sensitiveGlobs?: string[];
    safeSupportGlobs?: string[];
    ignoredGlobs?: string[];
    planCoherence?: RuntimePolicyTristateMode;
    repoSymbolDuplicateMode?: RuntimePolicyTristateMode;
    runtimeSafetyPolicy?: Partial<RuntimePolicySafetyProfile>;
}): RuntimePolicyManifest;
//# sourceMappingURL=runtime-policy-config.d.ts.map