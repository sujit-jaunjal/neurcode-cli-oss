/**
 * Governance pipeline runtime.
 *
 * Executes individual stages with:
 *   - deterministic input/output fingerprinting
 *   - bounded failure isolation per stage
 *   - timing + item-count metrics
 *   - dependency precondition checks
 *   - replay-metadata emission
 *
 * The runtime is INTENTIONALLY minimal. It does not implement a generic
 * workflow engine; it is a thin, explicit ledger for the canonical
 * verify pipeline.
 */
import type { GovernanceStageId, GovernanceStageResult } from '@neurcode-ai/contracts';
import type { GovernancePipelineContext, GovernancePipelineStage } from './types';
export interface RunStageOptions {
    /** Override status when the stage chose to skip itself (returns null). */
    skipReason?: string;
}
/**
 * Run a single pipeline stage. The result is appended to the context ledger
 * automatically; callers can also read it from the return value.
 *
 * Dependency preconditions:
 *   For each id in stage.boundary.dependencies, the ledger must contain a
 *   prior entry with status === 'succeeded' or 'degraded'. Missing or failed
 *   dependencies cause an 'aborted-precondition' failure.
 *
 * Failure isolation:
 *   When stage.boundary.isolateFailure is true, exceptions are caught and the
 *   result is recorded with status === 'failed'. Otherwise exceptions propagate
 *   to the caller (after the result is appended to the ledger).
 */
export declare function runStage<TIn, TOut>(stage: GovernancePipelineStage<TIn, TOut>, input: TIn, ctx: GovernancePipelineContext, options?: RunStageOptions): Promise<GovernanceStageResult<TOut>>;
/**
 * Pipeline-level execution: runs a sequential array of stages and returns the
 * accumulated ledger. Stops on the first unrecoverable failure.
 *
 * Most callers should use `runStage` directly inside verify.ts — this helper
 * exists for tests, fixture replay, and future fully-staged orchestration.
 */
export declare function runPipeline(stages: Array<{
    stage: GovernancePipelineStage<unknown, unknown>;
    input: unknown;
}>, ctx: GovernancePipelineContext): Promise<GovernanceStageResult[]>;
/**
 * Get the most recent result for a given stage from the ledger.
 * Returns undefined if the stage has not run yet.
 */
export declare function getStageResult<T = unknown>(ctx: GovernancePipelineContext, stageId: GovernanceStageId): GovernanceStageResult<T> | undefined;
/**
 * Build an immutable pipeline context. Convenience factory.
 */
export declare function createPipelineContext(init: {
    projectRoot: string;
    ciMode: boolean;
    jsonMode: boolean;
    startedAtMs?: number;
    runId?: string;
}): GovernancePipelineContext;
/**
 * Thrown when a required stage fails. The pipeline runtime appends the failing
 * result to the ledger BEFORE throwing, so callers can inspect via ctx.ledger.
 */
export declare class GovernanceStageAbortedError extends Error {
    readonly result: GovernanceStageResult;
    constructor(result: GovernanceStageResult);
}
//# sourceMappingURL=runtime.d.ts.map