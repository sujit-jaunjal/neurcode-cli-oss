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
import type { GovernancePipelineSummary, GovernanceStageResult } from '@neurcode-ai/contracts';
export declare function buildPipelineSummary(ledger: readonly GovernanceStageResult[]): GovernancePipelineSummary;
//# sourceMappingURL=summary.d.ts.map