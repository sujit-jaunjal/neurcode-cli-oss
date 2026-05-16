/**
 * Verify Command
 *
 * Runs deterministic operational governance against the current diff:
 *   - Intent contract enforcement (approved scope + forbidden boundaries)
 *   - Structural rules (PY/SR/DS catalogues)
 *   - Drift narrative synthesis + governance posture rollup
 *   - Generated-code spillover + boundary classification
 *   - Replay continuity (canonical replay checksum, byte-stable per inputs)
 *
 * Emits a single canonical envelope plus a `runtimeCapabilities` declaration so
 * enterprise CI gates can assert what actually executed instead of inferring
 * from absent fields. The command is the verification step in the canonical
 * governance lifecycle; remediation is performed by an external AI assistant,
 * never by this command.
 *
 * See `docs/governance-vocabulary.md` for canonical terminology.
 */
interface VerifyOptions {
    planId?: string;
    projectId?: string;
    /** CI-safe deterministic mode: policy-only + non-interactive + no cloud/runtime-state assumptions. */
    ci?: boolean;
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
    /** Print extra explanatory output for demos/onboarding. */
    demo?: boolean;
    /** Generate deterministic verification evidence artifact. */
    evidence?: boolean;
    /** Optional evidence artifact directory (default: .neurcode/evidence). */
    evidenceDir?: string;
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
    /**
     * Fail (exit 2) if the intent runtime is not active for this run — i.e.
     * `intent-pack.json` is missing, unreadable, or the synthesised context
     * could not be built. Equivalent env var: `NEURCODE_REQUIRE_INTENT_RUNTIME=1`.
     * Honoured by the local-only execution path; the cloud path treats it as
     * "fail if plan/intent context absent" via the existing `requirePlan` flag.
     */
    requireIntentRuntime?: boolean;
}
export declare function verifyCommand(options: VerifyOptions): Promise<undefined>;
export {};
//# sourceMappingURL=verify.d.ts.map