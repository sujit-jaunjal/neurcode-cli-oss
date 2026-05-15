"use strict";
/**
 * Pipeline summary builder.
 *
 * Derives a `GovernancePipelineSummary` from a ledger of stage results. The
 * summary is the audience-facing surface for explainability dashboards,
 * stage-level SLOs, and replay reconstruction.
 *
 * The `pipelineFingerprint` is a SHA-256 over the ordered sequence of
 * (stageId, status, outputFingerprint?) tuples. It is independent of and
 * non-overlapping with `GovernanceVerificationEnvelope.replayChecksum`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPipelineSummary = buildPipelineSummary;
const crypto_1 = require("crypto");
const contracts_1 = require("@neurcode-ai/contracts");
function buildPipelineSummary(ledger) {
    const stages = ledger.map(entry => ({
        stageId: entry.stageId,
        status: entry.status,
        determinism: entry.replay.determinism,
        durationMs: entry.metrics.durationMs,
        inputFingerprint: entry.replay.inputFingerprint,
        outputFingerprint: entry.replay.outputFingerprint,
        dependsOn: [...entry.replay.dependsOn],
        failureCategory: entry.failure?.category,
    }));
    const fingerprintInput = stages
        .map(s => `${s.stageId}\x1e${s.status}\x1e${s.outputFingerprint ?? ''}`)
        .join('\x00');
    const pipelineFingerprint = (0, crypto_1.createHash)('sha256')
        .update(fingerprintInput, 'utf-8')
        .digest('hex');
    const totalDurationMs = stages.reduce((acc, s) => acc + (s.durationMs || 0), 0);
    const degradedStages = stages
        .filter(s => s.status === 'degraded')
        .map(s => s.stageId);
    const failedStages = stages
        .filter(s => s.status === 'failed')
        .map(s => s.stageId);
    return {
        schemaVersion: contracts_1.GOVERNANCE_PIPELINE_SCHEMA_VERSION,
        pipelineFingerprint,
        stages,
        totalDurationMs,
        degradedStages,
        failedStages,
    };
}
//# sourceMappingURL=summary.js.map