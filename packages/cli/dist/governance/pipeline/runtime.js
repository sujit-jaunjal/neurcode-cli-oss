"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceStageAbortedError = void 0;
exports.runStage = runStage;
exports.runPipeline = runPipeline;
exports.getStageResult = getStageResult;
exports.createPipelineContext = createPipelineContext;
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
async function runStage(stage, input, ctx, options = {}) {
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    const inputFingerprint = stage.fingerprintInput?.(input);
    const memoryBaseline = readHeapUsed();
    // Dependency precondition check
    const unmetDependency = findUnmetDependency(stage.boundary.dependencies, ctx);
    if (unmetDependency) {
        const finishedAtMs = Date.now();
        const result = {
            stageId: stage.id,
            status: 'failed',
            output: null,
            metrics: emitMetrics(startedAtMs, finishedAtMs, memoryBaseline, input, null, stage),
            replay: {
                stageId: stage.id,
                determinism: stage.determinism,
                inputFingerprint,
                dependsOn: [...stage.boundary.dependencies],
                startedAt,
                finishedAt: new Date(finishedAtMs).toISOString(),
            },
            failure: {
                category: 'aborted-precondition',
                message: `stage '${stage.id}' aborted: dependency '${unmetDependency}' did not succeed`,
                recoverable: stage.boundary.isolateFailure,
            },
        };
        ctx.ledger.push(result);
        if (!stage.boundary.isolateFailure && stage.boundary.required) {
            throw new GovernanceStageAbortedError(result);
        }
        return result;
    }
    // Execute
    let output = null;
    let status = 'succeeded';
    let failure;
    try {
        const raw = await stage.execute(input, ctx);
        if (raw === null || raw === undefined) {
            output = null;
            status = options.skipReason ? 'skipped' : 'degraded';
        }
        else {
            output = raw;
        }
    }
    catch (err) {
        output = null;
        status = 'failed';
        failure = {
            category: classifyError(err),
            message: shortError(err),
            recoverable: stage.boundary.isolateFailure,
        };
    }
    const finishedAtMs = Date.now();
    const outputFingerprint = output !== null ? stage.fingerprintOutput?.(output) : undefined;
    const result = {
        stageId: stage.id,
        status,
        output,
        metrics: emitMetrics(startedAtMs, finishedAtMs, memoryBaseline, input, output, stage),
        replay: {
            stageId: stage.id,
            determinism: stage.determinism,
            inputFingerprint,
            outputFingerprint,
            dependsOn: [...stage.boundary.dependencies],
            startedAt,
            finishedAt: new Date(finishedAtMs).toISOString(),
        },
        failure,
        notes: options.skipReason ? [options.skipReason] : undefined,
    };
    ctx.ledger.push(result);
    if (status === 'failed' && !stage.boundary.isolateFailure) {
        throw new GovernanceStageAbortedError(result);
    }
    return result;
}
/**
 * Pipeline-level execution: runs a sequential array of stages and returns the
 * accumulated ledger. Stops on the first unrecoverable failure.
 *
 * Most callers should use `runStage` directly inside verify.ts — this helper
 * exists for tests, fixture replay, and future fully-staged orchestration.
 */
async function runPipeline(stages, ctx) {
    for (const { stage, input } of stages) {
        try {
            await runStage(stage, input, ctx);
        }
        catch (err) {
            if (err instanceof GovernanceStageAbortedError) {
                break;
            }
            throw err;
        }
    }
    return ctx.ledger;
}
/**
 * Get the most recent result for a given stage from the ledger.
 * Returns undefined if the stage has not run yet.
 */
function getStageResult(ctx, stageId) {
    for (let i = ctx.ledger.length - 1; i >= 0; i--) {
        if (ctx.ledger[i].stageId === stageId) {
            return ctx.ledger[i];
        }
    }
    return undefined;
}
/**
 * Build an immutable pipeline context. Convenience factory.
 */
function createPipelineContext(init) {
    return {
        projectRoot: init.projectRoot,
        ciMode: init.ciMode,
        jsonMode: init.jsonMode,
        startedAtMs: init.startedAtMs ?? Date.now(),
        runId: init.runId,
        ledger: [],
    };
}
/**
 * Thrown when a required stage fails. The pipeline runtime appends the failing
 * result to the ledger BEFORE throwing, so callers can inspect via ctx.ledger.
 */
class GovernanceStageAbortedError extends Error {
    result;
    constructor(result) {
        super(`governance stage '${result.stageId}' aborted: ${result.failure?.message ?? 'unknown failure'}`);
        this.name = 'GovernanceStageAbortedError';
        this.result = result;
    }
}
exports.GovernanceStageAbortedError = GovernanceStageAbortedError;
// ── Internals ────────────────────────────────────────────────────────────────
function findUnmetDependency(deps, ctx) {
    for (const dep of deps) {
        const prior = getStageResult(ctx, dep);
        if (!prior || (prior.status !== 'succeeded' && prior.status !== 'degraded')) {
            return dep;
        }
    }
    return null;
}
function emitMetrics(startedAtMs, finishedAtMs, memoryBaseline, input, output, stage) {
    const memoryNow = readHeapUsed();
    const memoryDeltaBytes = typeof memoryBaseline === 'number' && typeof memoryNow === 'number'
        ? memoryNow - memoryBaseline
        : undefined;
    return {
        durationMs: finishedAtMs - startedAtMs,
        inputItemCount: stage.inputItemCount?.(input),
        outputItemCount: output !== null ? stage.outputItemCount?.(output) : undefined,
        memoryDeltaBytes,
    };
}
function readHeapUsed() {
    try {
        return process.memoryUsage().heapUsed;
    }
    catch {
        return undefined;
    }
}
function classifyError(err) {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (message.includes('timeout') || message.includes('timed out'))
        return 'timeout';
    if (message.includes('invariant'))
        return 'invariant-violation';
    if (message.includes('depend'))
        return 'degraded-dependency';
    return 'exception';
}
function shortError(err) {
    const raw = err instanceof Error ? (err.message || err.name) : String(err);
    // Strip absolute paths and bound length so failure messages stay stable + PII-free.
    const stripped = raw.replace(/\/Users\/[^/\s]+\//g, '/<user>/').replace(/\/home\/[^/\s]+\//g, '/<user>/');
    return stripped.length > 240 ? stripped.slice(0, 237) + '…' : stripped;
}
//# sourceMappingURL=runtime.js.map