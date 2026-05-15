/**
 * Evidence Lifecycle Runtime
 * --------------------------
 * Extracts the closure-heavy evidence/finalize plumbing previously inlined at
 * `commands/verify.ts:2816–2905`. The original implementation captured five
 * pieces of mutable state via closure (`lastCanonicalOutput`,
 * `lastEvidenceFallbackOutput`, `evidenceFinalizeAttempted`,
 * `verifyStartedAtMs`, `lastProvenanceRunId`) and exposed three lambdas
 * (`captureEvidencePayload`, `finalizeEvidence`, `exitWithEvidence`).
 *
 * This module replaces that pattern with a typed, explicit holder object so:
 *   - lifecycle state is replay-visible (not hidden inside a closure)
 *   - finalize idempotency is enforced at the type level
 *   - the caller decides termination policy (we DO NOT call process.exit here)
 *   - degraded persistence (write failure, missing payload) is explicit
 *
 * Semantic preservation:
 *   - finalize is called at most once (existing invariant)
 *   - write failure is swallowed and (in non-JSON mode) reported (existing)
 *   - calibration telemetry call (`appendVerifyCompletedFromCanonical`) is
 *     wrapped in try/catch (existing)
 *   - process.exit is INVOKED BY THE CALLER, not by this module
 *
 * Replay invariant:
 *   The evidence artifact written by `runEvidenceFinalize` is byte-identical
 *   to what the prior closure wrote, for any given lifecycle state. The
 *   transition `appendVerifyCompletedFromCanonical(...)` happens at the same
 *   point (after finalize, before exit) so telemetry semantics are preserved.
 */
import type { VerificationEvidenceContext } from '../../../utils/verification-evidence';
/**
 * Replay-visible lifecycle state. Replaces the four mutable `let`s previously
 * declared at the top of `verifyCommand`.
 *
 * Mutated by `captureEvidencePayload`, `setProvenanceRunId`, and
 * `runEvidenceFinalize` — never by external callers.
 */
export interface EvidenceLifecycleState {
    /** Last canonical (toCanonicalVerifyOutput-shaped) payload observed. */
    lastCanonicalOutput: Record<string, unknown> | null;
    /** Last raw verify payload observed (fallback used when canonical is null). */
    lastEvidenceFallbackOutput: Record<string, unknown> | null;
    /** True once finalize has been attempted (success OR failure); idempotent. */
    finalizeAttempted: boolean;
    /** Provenance run ID written during normal flow; null until set. */
    lastProvenanceRunId: string | null;
}
/**
 * Static configuration for the lifecycle. Captured once when verify starts.
 */
export interface EvidenceLifecycleConfig {
    enabled: boolean;
    projectRoot: string;
    startedAtMs: number;
    ciMode: boolean;
    deterministicMode: boolean;
    evidenceDir?: string;
    ciContext: VerificationEvidenceContext;
    /** Runtime-metadata block embedded in the evidence artifact. */
    runtimeMetadata: {
        cliJsonContractVersion: string;
        runtimeCompatibilityContractVersion: string;
        componentVersion: string;
        nodeVersion: string;
        platform: string;
        arch: string;
        command: string;
    };
    /** JSON mode flag — controls whether finalize-failure prints to stderr. */
    jsonMode: boolean;
    /**
     * Caller-supplied chalk-dimming logger for the success path. The original
     * implementation used `chalk.dim` from `commands/verify.ts`; we delegate to
     * the caller so this module stays chalk-free.
     */
    reportArtifactPath?: (path: string) => void;
    /** Caller-supplied warning logger for finalize-failure (non-JSON mode). */
    reportFinalizeFailure?: (message: string) => void;
    /**
     * Caller-supplied canonical-form transformer. The original verify.ts
     * function `toCanonicalVerifyOutput` is passed in to avoid a circular
     * dependency between this module and the command file. Required.
     */
    toCanonicalVerifyOutput: (payload: Record<string, unknown>) => Record<string, unknown>;
}
/**
 * Create a fresh lifecycle state. Replaces the four `let` declarations at the
 * top of `verifyCommand`.
 */
export declare function createEvidenceLifecycleState(): EvidenceLifecycleState;
/**
 * Record a verify payload into the lifecycle state. Computes the canonical
 * representation eagerly so finalize can write either form. Replaces the
 * `captureEvidencePayload` closure.
 *
 * Pure side-effect on the state object — no I/O.
 */
export declare function captureEvidencePayload(state: EvidenceLifecycleState, config: Pick<EvidenceLifecycleConfig, 'toCanonicalVerifyOutput'>, payload: Record<string, unknown>): void;
/**
 * Set the provenance run ID. Replaces the inline mutation `lastProvenanceRunId = ...`.
 */
export declare function setProvenanceRunId(state: EvidenceLifecycleState, runId: string | null): void;
/**
 * Result of finalizing the evidence lifecycle. Surfaced so the caller can
 * print to stdout in non-JSON mode and trace the lifecycle in replay tools.
 */
export interface EvidenceFinalizeResult {
    attempted: boolean;
    skipped: boolean;
    /** Reason for skip when `skipped` is true. */
    skipReason?: 'disabled' | 'already-attempted';
    /** Path of the written evidence artifact when persistence succeeded. */
    artifactPath: string | null;
    /** Error message when persistence failed. */
    error?: string;
}
/**
 * Run the evidence-finalize lifecycle. Replaces the `finalizeEvidence` closure.
 *
 * Idempotent: subsequent calls return `{ attempted: true, skipped: true }`.
 * Never throws — failures are surfaced via the returned `error` field and the
 * configured warning logger.
 */
export declare function runEvidenceFinalize(state: EvidenceLifecycleState, config: EvidenceLifecycleConfig, exitCode: number): EvidenceFinalizeResult;
/**
 * Run the telemetry-calibration emission. Replaces the inline call
 * `appendVerifyCompletedFromCanonical(projectRoot, lastCanonicalOutput,
 * lastProvenanceRunId)` previously inside the `exitWithEvidence` closure.
 *
 * Never throws — calibration must not affect verify exit.
 */
export declare function emitCalibrationTelemetry(state: EvidenceLifecycleState, config: Pick<EvidenceLifecycleConfig, 'projectRoot'>): void;
//# sourceMappingURL=evidence-lifecycle.d.ts.map