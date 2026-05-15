/**
 * CLI-side governance pipeline types.
 *
 * Builds on `@neurcode-ai/contracts` stage contracts with executor-side detail
 * (context, stage definition, ledger). The wire-level types remain in contracts.
 */
import type { DeterminismClassification, GovernanceStageBoundary, GovernanceStageId, GovernanceStageResult } from '@neurcode-ai/contracts';
/**
 * Per-run pipeline context. Carries cross-stage execution state, environment,
 * and the in-progress ledger of stage results.
 *
 * The context is INTENTIONALLY narrow. Stages must not stash unstructured data
 * here; new shared state belongs in a stage's typed output or in a dedicated
 * follow-up contract.
 */
export interface GovernancePipelineContext {
    /** Absolute project root, resolved once at the top of verify. */
    readonly projectRoot: string;
    /** True when running in CI / policy-only deterministic mode. */
    readonly ciMode: boolean;
    /** True when JSON mode is requested (suppresses human-readable side effects). */
    readonly jsonMode: boolean;
    /** Wall-clock start time of the verify run (ms since epoch). */
    readonly startedAtMs: number;
    /** Mutable ledger of completed stage results. Append-only by convention. */
    readonly ledger: GovernanceStageResult[];
    /** Optional run ID for cross-stage correlation. */
    runId?: string;
}
/**
 * Stage definition contract.
 *
 * `execute` MUST be deterministic given its input — observable side effects
 * (filesystem reads, git invocations, etc.) are allowed but their outputs must
 * be reflected in `fingerprintOutput` so replays can detect drift.
 */
export interface GovernancePipelineStage<TIn, TOut> {
    readonly id: GovernanceStageId;
    readonly determinism: DeterminismClassification;
    readonly boundary: GovernanceStageBoundary;
    /** Human-readable description for explainability dashboards. */
    readonly description?: string;
    /**
     * Run the stage. Throwing aborts the pipeline UNLESS boundary.isolateFailure
     * is true, in which case the runner catches and emits a failed result.
     */
    execute(input: TIn, ctx: GovernancePipelineContext): Promise<TOut> | TOut;
    /** Compute a deterministic fingerprint of the input for replay lineage. */
    fingerprintInput?(input: TIn): string | undefined;
    /** Compute a deterministic fingerprint of the output for replay lineage. */
    fingerprintOutput?(output: TOut): string | undefined;
    /** Report an input item count for observability. Optional. */
    inputItemCount?(input: TIn): number | undefined;
    /** Report an output item count for observability. Optional. */
    outputItemCount?(output: TOut): number | undefined;
}
/**
 * Default boundary policy: required, strict, no dependencies.
 *
 * Most stages should NOT use this directly — they should declare their actual
 * upstream dependencies so replay can reconstruct the computation graph.
 */
export declare const STRICT_REQUIRED_BOUNDARY: GovernanceStageBoundary;
/**
 * Boundary policy for optional observability / non-load-bearing stages.
 * Failures here are caught and surfaced but never abort governance.
 */
export declare const OBSERVABILITY_BOUNDARY: GovernanceStageBoundary;
//# sourceMappingURL=types.d.ts.map