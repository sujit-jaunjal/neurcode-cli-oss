"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildComputationTrace = buildComputationTrace;
exports.renderComputationTrace = renderComputationTrace;
/**
 * Build a deterministic computation trace from a pipeline ledger.
 *
 * The trace renders the same way for the same ledger across runs and
 * machines. Wall-clock durations are reported but never used in headlines
 * (they would non-determinize the trace).
 */
function buildComputationTrace(ledger) {
    const rows = ledger.map((entry) => ({
        stageId: entry.stageId,
        status: entry.status,
        determinism: entry.replay.determinism,
        durationMs: entry.metrics.durationMs,
        outputFingerprintShort: entry.replay.outputFingerprint
            ? entry.replay.outputFingerprint.slice(0, 12)
            : null,
        dependsOn: [...entry.replay.dependsOn],
        failureCategory: entry.failure?.category,
    }));
    const notableStages = ledger
        .filter((e) => e.status !== 'succeeded')
        .map((e) => e.stageId);
    const succeededCount = ledger.filter((e) => e.status === 'succeeded').length;
    const totalCount = ledger.length;
    let headline;
    if (totalCount === 0) {
        headline = 'governance pipeline: no stages executed';
    }
    else if (notableStages.length === 0) {
        headline = `governance pipeline: ${totalCount} stage(s) succeeded`;
    }
    else {
        headline =
            `governance pipeline: ${succeededCount}/${totalCount} succeeded; ` +
                `${notableStages.length} stage(s) did not succeed`;
    }
    return { headline, rows, notableStages };
}
/**
 * Render a computation trace as a deterministic multi-line text block.
 *
 * Output format is stable across runs given the same ledger (durations are
 * truncated to integer milliseconds; nothing else is wall-clock-dependent).
 * Suitable for embedding in --explain output or in CI logs.
 */
function renderComputationTrace(trace) {
    const lines = [];
    lines.push(trace.headline);
    for (const row of trace.rows) {
        const fp = row.outputFingerprintShort ?? '-';
        const deps = row.dependsOn.length > 0 ? ` ← [${row.dependsOn.join(', ')}]` : '';
        const failure = row.failureCategory ? ` (failure: ${row.failureCategory})` : '';
        lines.push(`  • ${row.stageId.padEnd(28)} ${row.status.padEnd(10)} ` +
            `${row.determinism.padEnd(28)} fp=${fp}${deps}${failure}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=computation-trace.js.map