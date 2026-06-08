import type { GovernanceSession } from '@neurcode-ai/governance-runtime';
export declare const AGENT_GUARD_SCHEMA_VERSION: "neurcode.agent-guard.v1";
export type AgentGuardChangeType = 'created' | 'modified' | 'deleted';
export type AgentGuardClassification = 'verified_prewrite' | 'denied_but_changed' | 'prewrite_call_without_verdict' | 'observed_after_only' | 'unverified_write';
export interface AgentGuardFileSnapshot {
    path: string;
    digest: string;
    size: number;
}
export interface AgentGuardArtifact {
    schemaVersion: typeof AGENT_GUARD_SCHEMA_VERSION;
    guardId: string;
    sessionId: string;
    agent: string;
    adapter: string;
    repoRoot: string;
    startedAt: string;
    updatedAt: string;
    finishedAt: string | null;
    active: boolean;
    baseline: {
        fileCount: number;
        treeHash: string;
        files: AgentGuardFileSnapshot[];
    };
    privacy: {
        metadataOnly: true;
        sourceUploaded: false;
        sourceIncluded: false;
        localContentDigestsOnly: true;
    };
}
export interface AgentGuardReadResult {
    path: string;
    exists: boolean;
    artifact: AgentGuardArtifact | null;
    error?: string;
}
export interface AgentGuardFileEvidence {
    preWriteCallCount: number;
    allowedPreWriteCheckCount: number;
    deniedPreWriteCheckCount: number;
    postWriteObservationCount: number;
    latestEventAt: string | null;
}
export interface AgentGuardChangedFile {
    path: string;
    changeType: AgentGuardChangeType;
    classification: AgentGuardClassification;
    evidence: AgentGuardFileEvidence;
}
export interface AgentGuardEvaluation {
    schemaVersion: typeof AGENT_GUARD_SCHEMA_VERSION;
    ok: true;
    pass: boolean;
    status: 'following_contract' | 'attention_required';
    generatedAt: string;
    guardId: string;
    sessionId: string;
    agent: string;
    adapter: string;
    repoRoot: string;
    summary: {
        changedFiles: number;
        verifiedPrewrite: number;
        unverifiedWrites: number;
        deniedButChanged: number;
        observedAfterOnly: number;
        prewriteCallsWithoutVerdict: number;
    };
    changedFiles: AgentGuardChangedFile[];
    nextAction: string;
    privacy: AgentGuardArtifact['privacy'];
}
export declare function captureAgentGuardSnapshot(repoRoot: string): AgentGuardFileSnapshot[];
export declare function snapshotMapFromFiles(files: AgentGuardFileSnapshot[]): Map<string, AgentGuardFileSnapshot>;
export declare function snapshotFilesFromMap(map: Map<string, AgentGuardFileSnapshot>): AgentGuardFileSnapshot[];
export declare function hashRepoFile(repoRoot: string, repoRelativePath: string): AgentGuardFileSnapshot | null;
export declare function applyIncrementalSnapshotChanges(repoRoot: string, current: Map<string, AgentGuardFileSnapshot>, changedPaths: string[]): void;
export declare function createAgentGuardArtifact(input: {
    repoRoot: string;
    sessionId: string;
    agent: string;
    adapter: string;
    startedAt?: string;
}): AgentGuardArtifact;
export declare function defaultAgentGuardPath(repoRoot: string, sessionId: string): string;
export declare function writeAgentGuardArtifact(repoRoot: string, artifact: AgentGuardArtifact, artifactPath?: string): string;
export declare function readAgentGuardArtifact(input: {
    repoRoot: string;
    sessionId?: string;
    artifactPath?: string;
}): AgentGuardReadResult;
export declare function evaluateAgentGuardFromLedger(repoRoot: string, artifact: AgentGuardArtifact, session: GovernanceSession, changes: Array<{
    path: string;
    changeType: AgentGuardChangeType;
}>): AgentGuardEvaluation;
export declare function evaluateAgentGuardFromCurrent(repoRoot: string, artifact: AgentGuardArtifact, session: GovernanceSession, current: AgentGuardFileSnapshot[]): AgentGuardEvaluation;
export declare function evaluateAgentGuard(repoRoot: string, artifact: AgentGuardArtifact, session: GovernanceSession): AgentGuardEvaluation;
export declare function markAgentGuardFinished(artifact: AgentGuardArtifact, finishedAt?: string): AgentGuardArtifact;
//# sourceMappingURL=agent-guard.d.ts.map