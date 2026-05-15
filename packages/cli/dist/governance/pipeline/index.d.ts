/**
 * Canonical Governance Pipeline — public surface.
 *
 * The pipeline transforms the verify orchestrator from a monolithic script
 * into a staged, replayable, explainable runtime. Each stage:
 *   - has a stable identifier from `GovernanceStageId`
 *   - declares its determinism classification and boundary policy
 *   - emits a replay-ready receipt (fingerprints, timings, dependencies)
 *   - participates in computation-graph lineage via `producedByStage`
 *
 * Wire-level types live in `@neurcode-ai/contracts`. CLI-internal types
 * (context, stage definitions) live alongside this module.
 */
export type { GovernancePipelineContext, GovernancePipelineStage, } from './types';
export { OBSERVABILITY_BOUNDARY, STRICT_REQUIRED_BOUNDARY, } from './types';
export { createPipelineContext, getStageResult, GovernanceStageAbortedError, runPipeline, runStage, } from './runtime';
export type { RunStageOptions } from './runtime';
export { buildPipelineSummary } from './summary';
export { fingerprintStageSignal, stableStringify, } from './fingerprint';
export { groupFindingsByStage, stampFindingLineage, } from './lineage';
export { enumerateNonSuccessStages, runStageOrAsyncFallback, runStageOrFallback, runStageWithReceipt, stageDegradedOrFailed, stageReceiptOrCompute, } from './helpers';
export { buildComputationTrace, renderComputationTrace, type GovernanceComputationTrace, type GovernanceComputationTraceRow, } from './computation-trace';
export { buildPolicyOnlyCanonicalPayload, buildVerifyCanonicalPayload, type AiDebtSummaryFragment, type ChangeContractSummaryFragment, type CompiledPolicyMetadataFragment, type GovernancePayloadFragment, type IntentProofSummaryFragment, type PolicyDecisionFragment, type PolicyLockSummaryFragment, type PolicyOnlyCanonicalPayloadInput, type PolicyPackFragment, type RuntimeGuardSummaryFragment, type VerifyCanonicalPayloadInput, } from './envelope-assembly';
export * from './orchestration';
export type { PolicyOnlySource } from './shared-types';
export * from './stages';
//# sourceMappingURL=index.d.ts.map