/**
 * Governance telemetry contracts — deterministic, privacy-bounded, replay-friendly.
 * No hidden network analytics; all persistence is explicit local files under .neurcode/telemetry.
 */
export declare const GOVERNANCE_TELEMETRY_SCHEMA_VERSION: "2026-05-11.telemetry.v1";
/** High-level event kinds (extend additively). */
export type GovernanceTelemetryEventType = 'governance.verify.completed' | 'finding.viewed' | 'finding.acknowledged' | 'finding.suppressed' | 'finding.waived' | 'finding.ignored' | 'finding.fixed' | 'merge.after_blocking' | 'replay.artifact.opened' | 'replay.artifact.ignored' | 'ci.bypass_attempt' | 'rule.trigger' | 'reviewer.interaction';
export interface GovernanceTelemetryEnvelope {
    schemaVersion: typeof GOVERNANCE_TELEMETRY_SCHEMA_VERSION;
    /** ISO-8601; wall clock for ordering only — replays must not depend on exact instant. */
    emittedAt: string;
    eventType: GovernanceTelemetryEventType;
    /** Optional correlation to provenance when caller has a run id (UUID). */
    runId?: string | null;
    /** Stable digest of finding ids for this batch (sha256 hex, 64 chars). */
    findingSetDigest?: string;
    payload: GovernanceTelemetryPayload;
}
export type GovernanceTelemetryPayload = GovernanceVerifyCompletedPayload | FindingLifecyclePayload | RuleTriggerPayload | ReplayArtifactPayload | CiBypassPayload | ReviewerInteractionPayload | Record<string, never>;
/** Emitted once per verify exit path when canonical JSON is available. */
export interface GovernanceVerifyCompletedPayload {
    verdict: 'PASS' | 'FAIL' | 'WARN' | string;
    governanceFindingCount: number;
    blockingFindingCount: number;
    advisoryFindingCount: number;
    determinismHistogram: Record<string, number>;
    suppressedFindingCount: number;
    waivedFindingCount: number;
    structuralRuleTriggerHistogram: Record<string, number>;
    structuralRuleSuppressionHistogram: Record<string, number>;
    compressedDuplicateCount: number;
    replayIntegrityStatus?: 'exact' | 'bounded-degradation' | 'invalidated' | null;
    ciMode: boolean;
    policyOnly: boolean;
    /** Counts only — never file paths or code excerpts. */
    mergeAfterBlocking?: boolean;
}
export interface FindingLifecyclePayload {
    findingId: string;
    ruleId?: string;
    action: 'viewed' | 'acknowledged' | 'suppressed' | 'waived' | 'ignored' | 'fixed';
}
export interface RuleTriggerPayload {
    ruleId: string;
    count: number;
}
export interface ReplayArtifactPayload {
    artifactKind: 'evidence' | 'execution' | 'digest';
    action: 'opened' | 'ignored';
}
export interface CiBypassPayload {
    channel: 'env' | 'flag' | 'workflow' | 'unknown';
    detail?: string;
}
export interface ReviewerInteractionPayload {
    kind: 'summary_expand' | 'summary_collapse' | 'comment_reply' | 'other';
    signal?: string;
}
