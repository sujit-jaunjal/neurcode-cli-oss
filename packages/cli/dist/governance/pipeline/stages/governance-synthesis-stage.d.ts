/**
 * Governance Synthesis Stage
 * --------------------------
 * Wraps `attachCanonicalGovernance` — the single canonical pipeline entry point
 * that converts heterogeneous raw violations into the deterministic
 * `GovernanceVerificationEnvelope`. After attachment, each finding is stamped
 * with its computation-graph stage of origin (inferred from `sourceSystem`).
 *
 * SEMANTIC PRESERVATION:
 *   - The envelope structure, finding IDs, replay checksum, and ordering
 *     produced by `attachCanonicalGovernance` are preserved BYTE-FOR-BYTE.
 *   - Lineage stamping writes ONLY into `provenanceMetadata.producedByStage`,
 *     which is excluded from the canonical finding identity and from the
 *     replay-checksum input. Verified in `canonical-invariants.ts`.
 *
 *   This stage is therefore observability-additive: removing the stamp call
 *   restores byte-for-byte identical output.
 */
import type { GovernanceFinding, GovernanceStageResult, GovernanceVerificationEnvelope } from '@neurcode-ai/contracts';
import { stampFindingLineage } from '../lineage';
import type { GovernancePipelineStage } from '../types';
export interface GovernanceSynthesisInput {
    /** Verify payload with raw violations already attached (structuralViolations, policyViolations, intentIssues, ...). */
    payload: Record<string, unknown>;
}
export interface GovernanceSynthesisOutput {
    payload: Record<string, unknown>;
    envelope: GovernanceVerificationEnvelope;
    findings: GovernanceFinding[];
}
export declare const governanceSynthesisStage: GovernancePipelineStage<GovernanceSynthesisInput, GovernanceSynthesisOutput>;
/**
 * Pure helper: synthesize the canonical governance envelope from a verify
 * payload, then stamp computation-graph lineage onto every finding.
 *
 * Identical to `governanceSynthesisStage.execute({ payload })` but callable
 * without a pipeline context. Use this from verify.ts code paths that emit
 * canonical JSON directly (early-exit branches, etc.).
 *
 * Guarantee: this function preserves the byte identity of the canonical
 * envelope produced by `attachCanonicalGovernance`. Lineage stamping only
 * writes to `provenanceMetadata.producedByStage`, which is excluded from
 * the finding identity and from `replayChecksum`.
 */
export declare function synthesizeGovernance(payload: Record<string, unknown>, options?: {
    pipelineLedger?: readonly GovernanceStageResult[];
}): GovernanceSynthesisOutput;
/**
 * Re-export for callers that want to stamp lineage on findings they
 * manufactured outside this stage.
 */
export { stampFindingLineage };
//# sourceMappingURL=governance-synthesis-stage.d.ts.map