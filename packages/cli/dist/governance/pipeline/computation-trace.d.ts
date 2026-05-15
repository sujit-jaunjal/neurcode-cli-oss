/**
 * Governance computation trace surface.
 *
 * Produces a compact, human-readable summary of HOW a verify run computed
 * its governance verdict. The trace is derived entirely from the pipeline
 * ledger — no re-computation, no re-inspection. Pure observability.
 *
 * Audience:
 *   - dashboards rendering an explainability column
 *   - audit / replay reviewers who want a one-screen narrative
 *   - operators triaging degraded or failed governance runs
 *
 * Constraints:
 *   - Deterministic given the same ledger.
 *   - No PII or excerpts — only stage IDs, statuses, fingerprints.
 *   - Bounded length: at most one line per stage plus a header.
 */
import type { GovernanceStageId, GovernanceStageResult, GovernanceStageStatus } from '@neurcode-ai/contracts';
export interface GovernanceComputationTrace {
    /** One-line summary suitable for a dashboard header. */
    headline: string;
    /** Detail rows; one per stage, in canonical execution order. */
    rows: GovernanceComputationTraceRow[];
    /** Stage IDs of stages that did not reach 'succeeded'. */
    notableStages: GovernanceStageId[];
}
export interface GovernanceComputationTraceRow {
    stageId: GovernanceStageId;
    status: GovernanceStageStatus;
    determinism: string;
    durationMs: number;
    outputFingerprintShort: string | null;
    dependsOn: GovernanceStageId[];
    failureCategory?: string;
}
/**
 * Build a deterministic computation trace from a pipeline ledger.
 *
 * The trace renders the same way for the same ledger across runs and
 * machines. Wall-clock durations are reported but never used in headlines
 * (they would non-determinize the trace).
 */
export declare function buildComputationTrace(ledger: readonly GovernanceStageResult[]): GovernanceComputationTrace;
/**
 * Render a computation trace as a deterministic multi-line text block.
 *
 * Output format is stable across runs given the same ledger (durations are
 * truncated to integer milliseconds; nothing else is wall-clock-dependent).
 * Suitable for embedding in --explain output or in CI logs.
 */
export declare function renderComputationTrace(trace: GovernanceComputationTrace): string;
//# sourceMappingURL=computation-trace.d.ts.map