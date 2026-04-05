/**
 * Verify Command
 *
 * Compares current work (git diff) against an Architect Plan to measure adherence and detect bloat.
 */
interface VerifyOptions {
    planId?: string;
    projectId?: string;
    staged?: boolean;
    head?: boolean;
    base?: string;
    json?: boolean;
    record?: boolean;
    apiKey?: string;
    apiUrl?: string;
    /** Enforce plan presence and fail instead of falling back to policy-only mode. */
    requirePlan?: boolean;
    /** When true, skip scope/plan enforcement and run policy checks only (General Governance mode). */
    policyOnly?: boolean;
    /** Fail if policy lock baseline is missing. */
    requirePolicyLock?: boolean;
    /** Bypass policy lock enforcement checks. */
    skipPolicyLock?: boolean;
    /** Path to compiled policy artifact (default: neurcode.policy.compiled.json). */
    compiledPolicy?: string;
    /** Path to change contract artifact (default: .neurcode/change-contract.json). */
    changeContract?: string;
    /** Enforce change contract violations as hard failures. */
    enforceChangeContract?: boolean;
    /** Require deterministic compiled-policy + change-contract artifacts (enterprise strict mode). */
    strictArtifacts?: boolean;
    /** Require cryptographic signatures on deterministic artifacts. */
    requireSignedArtifacts?: boolean;
    /** Require runtime guard artifact to pass before verification evaluation. */
    requireRuntimeGuard?: boolean;
    /** Path to runtime guard artifact (default: .neurcode/runtime-guard.json). */
    runtimeGuard?: string;
    /** Print detailed AI change justification reasoning. */
    explain?: boolean;
    /** Use queue-backed async verification mode on the API. */
    asyncMode?: boolean;
    /** Poll interval for async verification job status. */
    verifyJobPollMs?: number;
    /** Max wait time for async verification completion. */
    verifyJobTimeoutMs?: number;
    /** Explicit idempotency key for queue-backed verify jobs. */
    verifyIdempotencyKey?: string;
    /** Max backend retry attempts for queue-backed verify jobs. */
    verifyJobMaxAttempts?: number;
}
export declare function verifyCommand(options: VerifyOptions): Promise<void>;
export {};
//# sourceMappingURL=verify.d.ts.map