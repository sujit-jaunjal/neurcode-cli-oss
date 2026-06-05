import type { GovernanceSession } from './session';
export declare const AGENT_GUARD_POSTURE_SCHEMA_VERSION: "neurcode.agent-guard-posture.v1";
export type AgentGuardPostureStatus = 'not_started' | 'awaiting_evaluation' | 'following_contract' | 'attention_required' | 'finished_clean' | 'finished_attention';
export type AgentGuardFileClassification = 'verified_prewrite' | 'denied_but_changed' | 'prewrite_call_without_verdict' | 'observed_after_only' | 'unverified_write';
export interface AgentGuardPostureFile {
    path: string;
    changeType: 'created' | 'modified' | 'deleted' | string;
    classification: AgentGuardFileClassification | string;
    evidence: {
        preWriteCallCount: number;
        allowedPreWriteCheckCount: number;
        deniedPreWriteCheckCount: number;
        postWriteObservationCount: number;
        latestEventAt: string | null;
    };
}
export interface AgentGuardPostureSummary {
    schemaVersion: typeof AGENT_GUARD_POSTURE_SCHEMA_VERSION;
    status: AgentGuardPostureStatus;
    sourceFree: true;
    guardId: string | null;
    active: boolean;
    startedAt: string | null;
    evaluatedAt: string | null;
    finishedAt: string | null;
    baselineFileCount: number;
    reportFingerprint: string | null;
    summary: {
        changedFiles: number;
        verifiedPrewrite: number;
        unverifiedWrites: number;
        deniedButChanged: number;
        observedAfterOnly: number;
        prewriteCallsWithoutVerdict: number;
    };
    changedFiles: AgentGuardPostureFile[];
    nextAction: string;
}
export declare function buildAgentGuardPostureSummary(session: GovernanceSession): AgentGuardPostureSummary;
//# sourceMappingURL=agent-guard-posture.d.ts.map