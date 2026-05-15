/**
 * Pipeline execution helpers.
 *
 * Compresses the repetitive verify.ts wire-in pattern:
 *
 *   const stageResult = await runStage(stage, input, ctx);
 *   const value = stageResult.output ?? fallback(...);
 *
 * into a single named helper, while preserving:
 *   - the underlying determinism of the wrapped function
 *   - the staged-pipeline ledger receipt
 *   - the byte-for-byte fallback semantics on isolated stage failure
 *
 * These are explicitly NOT a generic workflow engine. They are minimal,
 * typed helpers for the four governance-pipeline wire-in patterns we
 * encountered in verify.ts.
 *
 *   - runStageOrFallback        — "stage failed, compute the same thing without staging"
 *   - runStageWithDegradedFallback — "stage succeeded but output was null; fall back"
 *   - stageReceiptOrCompute     — "you only want a value; the receipt is bookkeeping"
 *   - getLastStageOutput        — "read the most recent ledger entry for a stage"
 *
 * Replay invariant: when the stage succeeds, the helper returns the stage's
 * output; the fallback is only used when the stage failed or produced null.
 * The fallback MUST be byte-equivalent to the stage's execute body — that
 * way semantics are preserved regardless of which branch ran.
 */
import type { GovernanceStageId, GovernanceStageResult } from '@neurcode-ai/contracts';
import type { GovernancePipelineContext, GovernancePipelineStage } from './types';
/**
 * Run a stage and unwrap its output. If the stage failed or returned null,
 * invoke the supplied fallback synchronously and use that value instead.
 *
 * The ledger always receives a receipt regardless of outcome — the fallback
 * does not produce its own receipt (that would double-count).
 */
export declare function runStageOrFallback<TIn, TOut>(stage: GovernancePipelineStage<TIn, TOut>, input: TIn, ctx: GovernancePipelineContext, fallback: () => TOut): Promise<TOut>;
/**
 * Same as `runStageOrFallback`, but the fallback may be async (e.g. when it
 * has to re-read from disk or call out to a sibling helper).
 */
export declare function runStageOrAsyncFallback<TIn, TOut>(stage: GovernancePipelineStage<TIn, TOut>, input: TIn, ctx: GovernancePipelineContext, fallback: () => Promise<TOut>): Promise<TOut>;
/**
 * Run a stage and return both the unwrapped output AND the full receipt.
 * Useful when the caller needs to consult the receipt (e.g. for failure
 * surfacing) but doesn't want to write the unwrap boilerplate.
 */
export declare function runStageWithReceipt<TIn, TOut>(stage: GovernancePipelineStage<TIn, TOut>, input: TIn, ctx: GovernancePipelineContext, fallback: () => TOut): Promise<{
    value: TOut;
    result: GovernanceStageResult<TOut>;
}>;
/**
 * If a stage has already run and produced output, return that. Otherwise run
 * the supplied compute function (and DO NOT append a ledger entry — this is
 * "look up or compute"). Used when verify.ts has already invoked a stage
 * elsewhere and a later code path needs the same value without re-emitting.
 */
export declare function stageReceiptOrCompute<T>(ctx: GovernancePipelineContext, stageId: GovernanceStageId, compute: () => T): T;
/**
 * Convenience: did a given stage record any non-success status in the ledger?
 *
 * Returns true when the stage ran and its status is `degraded` or `failed`.
 * Returns false when the stage succeeded OR has not yet run.
 */
export declare function stageDegradedOrFailed(ctx: GovernancePipelineContext, stageId: GovernanceStageId): boolean;
/**
 * Convenience: enumerate all stages in the ledger that are NOT 'succeeded'.
 * Used by computation-trace explainability helpers.
 */
export declare function enumerateNonSuccessStages(ctx: GovernancePipelineContext): Array<{
    stageId: GovernanceStageId;
    status: 'skipped' | 'degraded' | 'failed';
}>;
//# sourceMappingURL=helpers.d.ts.map