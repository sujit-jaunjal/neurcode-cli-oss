/**
 * Canonical Governance Pipeline Contracts
 * ----------------------------------------
 * Shared, immutable types describing the staged decomposition of the verify runtime.
 *
 * These contracts are ADDITIVE. They do not replace, mutate, or re-encode the canonical
 * governance envelope (`GovernanceVerificationEnvelope`), the finding identity scheme,
 * or the replay checksum. Stage metadata flows alongside the envelope as an
 * out-of-band observability + replay-reconstruction surface.
 *
 * Design invariants:
 *   - Stage IDs are a closed set. Adding a new stage requires bumping the schema version.
 *   - Stage metadata never carries excerpts, file content, or PII.
 *   - Stage fingerprints are computed from stable identifiers — never wall-clock timestamps.
 *   - A stage's `replay.outputFingerprint` is independent of `replayChecksum`; the two
 *     are consistent but serve different audiences (stage lineage vs. envelope identity).
 */
import type { DeterminismClassification } from './taxonomy';
/**
 * Closed set of canonical governance pipeline stage identifiers.
 *
 * The order of declaration is the canonical execution order. Consumers MUST treat
 * this list as the authoritative pipeline definition for replay reconstruction
 * and explainability dashboards.
 */
export type GovernanceStageId = 'diff-normalization' | 'plan-sync' | 'policy-lock' | 'compiled-policy' | 'policy-exceptions' | 'structural-analysis' | 'runtime-guard' | 'intent-evaluation' | 'semantic-analysis' | 'policy-evaluation' | 'suppression-evaluation' | 'advisory-signals' | 'change-contract' | 'ai-debt-budget' | 'governance-synthesis' | 'provenance-generation' | 'replay-integrity' | 'remediation-export-preparation' | 'evidence-generation' | 'telemetry-harvest' | 'ci-shaping' | 'output-rendering';
/**
 * Terminal state for a stage execution. `degraded` means the stage produced output
 * but a non-fatal anomaly was observed (e.g. truncation, partial dependency).
 */
export type GovernanceStageStatus = 'succeeded' | 'skipped' | 'degraded' | 'failed';
/**
 * Stage failure category. Maps to operator-visible runbooks and replay annotations.
 */
export type GovernanceStageFailureCategory = 'timeout' | 'exception' | 'invariant-violation' | 'degraded-dependency' | 'aborted-precondition';
export interface GovernanceStageMetrics {
    /** Stage wall-clock duration in milliseconds. */
    durationMs: number;
    /** Size of the stage input as a stable item count (e.g. diff files, rules). Optional. */
    inputItemCount?: number;
    /** Size of the stage output as a stable item count (e.g. findings produced). Optional. */
    outputItemCount?: number;
    /** Delta of `process.memoryUsage().heapUsed` across the stage. Optional. */
    memoryDeltaBytes?: number;
}
export interface GovernanceStageReplayMetadata {
    stageId: GovernanceStageId;
    /** Determinism classification of the stage itself (matches the most-deterministic finding it can emit). */
    determinism: DeterminismClassification;
    /** SHA-256 fingerprint of stage input, computed from stable identifiers only. */
    inputFingerprint?: string;
    /** SHA-256 fingerprint of stage output, computed from stable identifiers only. */
    outputFingerprint?: string;
    /** Stage IDs whose successful completion was a precondition for this stage. */
    dependsOn: GovernanceStageId[];
    /** Stage start time as an ISO-8601 timestamp. NOT included in fingerprints. */
    startedAt: string;
    /** Stage finish time as an ISO-8601 timestamp. NOT included in fingerprints. */
    finishedAt: string;
}
export interface GovernanceStageFailure {
    category: GovernanceStageFailureCategory;
    /** Stable, PII-free message. Never includes source excerpts. */
    message: string;
    /** True when the rest of the pipeline can proceed in a degraded mode. */
    recoverable: boolean;
}
/**
 * Boundary policy declared by a stage. The pipeline runtime uses this to decide
 * how to respond to failure (abort vs. degrade) and which stages must run first.
 */
export interface GovernanceStageBoundary {
    /** When true, the stage failing is reported but does NOT abort downstream stages. */
    isolateFailure: boolean;
    /** When true, the stage is required for governance correctness. */
    required: boolean;
    /** Stage IDs whose successful completion is required before this stage may execute. */
    dependencies: GovernanceStageId[];
}
/**
 * Single-stage execution receipt. Persisted alongside the canonical envelope and
 * consumed by replay reconstruction, observability dashboards, and SLO gates.
 *
 * `output` is the typed stage payload; consumers MUST treat it as immutable.
 */
export interface GovernanceStageResult<T = unknown> {
    stageId: GovernanceStageId;
    status: GovernanceStageStatus;
    /** Stage output. `null` when status is 'failed' or 'skipped'. */
    output: T | null;
    metrics: GovernanceStageMetrics;
    replay: GovernanceStageReplayMetadata;
    failure?: GovernanceStageFailure;
    /** Stage-emitted observability notes (PII-free, bounded). */
    notes?: string[];
}
/**
 * Compact, replay-friendly summary of a stage. Embedded into telemetry and the
 * pipeline-level summary surface.
 */
export interface GovernanceStageSummary {
    stageId: GovernanceStageId;
    status: GovernanceStageStatus;
    determinism: DeterminismClassification;
    durationMs: number;
    inputFingerprint?: string;
    outputFingerprint?: string;
    dependsOn: GovernanceStageId[];
    failureCategory?: GovernanceStageFailureCategory;
}
/**
 * Pipeline-level summary. Pinned across replays. The `pipelineFingerprint` is
 * a stable SHA-256 over the ordered (stageId, outputFingerprint, status) tuple
 * and is independent of `GovernanceVerificationEnvelope.replayChecksum`.
 */
export interface GovernancePipelineSummary {
    schemaVersion: typeof GOVERNANCE_PIPELINE_SCHEMA_VERSION;
    pipelineFingerprint: string;
    stages: GovernanceStageSummary[];
    totalDurationMs: number;
    degradedStages: GovernanceStageId[];
    failedStages: GovernanceStageId[];
}
export declare const GOVERNANCE_PIPELINE_SCHEMA_VERSION: "2026-05-14.1";
/**
 * Type guard: is the given string a known stage identifier?
 */
export declare function isGovernanceStageId(value: string): value is GovernanceStageId;
/**
 * Canonical execution order. Mirror of the union above — exported as a runtime
 * value for iteration, indexing, and stage-ordering invariants.
 */
export declare const GOVERNANCE_STAGE_ORDER: readonly GovernanceStageId[];
//# sourceMappingURL=pipeline.d.ts.map