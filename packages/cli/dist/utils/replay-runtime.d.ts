import { type ExecutionSource } from './execution-bus';
declare const REPLAY_STATE_SCHEMA: "neurcode.replay.state.v1";
declare const REPLAY_EXECUTION_SCHEMA: "neurcode.replay.execution.v1";
declare const REPLAY_WORKSPACE_SCHEMA: "neurcode.replay.workspace.v1";
declare const REPLAY_TIMELINE_SCHEMA: "neurcode.replay.timeline.v1";
type ReplayRiskLevel = 'low' | 'medium' | 'high';
type ReplayReconstructionStatus = 'exact' | 'bounded-degradation';
interface ReplayConfidenceComponent {
    score: number;
    note: string;
}
interface ReplayGovernanceReport {
    reconstructionStatus: ReplayReconstructionStatus;
    canReconstructExactly: boolean;
    missingArtifactSummaries: string[];
    semanticDegradationSummaries: string[];
    federationDegradationSummaries: string[];
    graphMismatchSummaries: string[];
    provenanceMismatchSummaries: string[];
    confidenceDriftSummaries: string[];
    confidence: {
        overall: number;
        provenance: ReplayConfidenceComponent;
        graph: ReplayConfidenceComponent;
        semantic: ReplayConfidenceComponent;
        federation: ReplayConfidenceComponent;
        artifacts: ReplayConfidenceComponent;
    };
}
interface ReplayExecutionDigest {
    file: string;
    id: string;
    type: string;
    source: ExecutionSource | 'unknown';
    actor: string;
    target: string | null;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    success: boolean;
    exitCode: number | null;
    message: string | null;
    trend: 'improved' | 'regressed' | 'unchanged' | 'baseline';
    blocking: number;
    advisory: number;
    evidenceRefs: string[];
    narrative: {
        summary: string;
        why: string;
        riskLevel: ReplayRiskLevel;
        recommendedAction: string;
        expectedImprovement: string;
    } | null;
}
interface ReplayEvidenceDigest {
    file: string;
    timestamp: string;
    verdict: string;
    pass: boolean;
    ciMode: boolean;
    deterministicMode: boolean;
    deterministicVerificationHash: string;
    blockingCount: number;
    advisoryCount: number;
    regressionCount: number;
    flowIssueCount: number;
    coverageScore: number | null;
    branch: string | null;
    commitSha: string | null;
    governanceFindingsCount: number;
    governanceDeterminismCounts: Record<string, number>;
    semanticTruncationCount: number;
    federationTruncationCount: number;
    graphTruncationCount: number;
    provenanceMissingCount: number;
    governanceEnvelopePresent: boolean;
    canonicalVerifyOutput: Record<string, unknown> | null;
}
interface ReplayWorkspaceSnapshotDigest {
    file: string;
    snapshotId: string;
    workspaceId: string;
    workspaceName: string;
    createdAt: string;
    source: ExecutionSource | 'unknown';
    actor: string;
    action: string;
    executionId: string | null;
    activeWorkspaceId: string | null;
    workspace: Record<string, unknown>;
    posture: Record<string, unknown> | null;
}
interface ReplayRuntimeEventDigest {
    id: string;
    cursor: string;
    type: string;
    timestamp: string;
    executionId: string;
    source: ExecutionSource | 'unknown';
    actor: string;
    severity: ReplayRiskLevel;
    payload: Record<string, unknown>;
}
export interface ReplayStateRequest {
    at: string;
    workspaceId?: string;
    includeEvents?: boolean;
    eventLimit?: number;
}
export interface ReplayExecutionRequest {
    executionId: string;
}
export interface ReplayWorkspaceRequest {
    workspaceId?: string;
    at?: string;
}
export interface ReplayTimelineRequest {
    workspaceId?: string;
    from?: string;
    to?: string;
    limit?: number;
}
export interface GovernanceReplayState {
    schemaVersion: typeof REPLAY_STATE_SCHEMA;
    generatedAt: string;
    asOf: string;
    rootDir: string;
    determinism: {
        immutableOnly: true;
        artifactHash: string;
        warnings: string[];
        inputs: {
            executionRecords: number;
            evidenceArtifacts: number;
            runtimeEvents: number;
            controlPlaneSnapshots: number;
            workspaceSnapshots: number;
        };
    };
    reconstruction: ReplayGovernanceReport;
    controlPlane: {
        snapshotId: string | null;
        createdAt: string | null;
        source: string | null;
        actor: string | null;
        changedSections: string[];
        state: {
            runtime: Record<string, unknown>;
            remediation: Record<string, unknown>;
            evidence: Record<string, unknown>;
            eventRuntime: Record<string, unknown>;
            ciGovernance: Record<string, unknown>;
            policyGovernance: Record<string, unknown>;
        } | null;
    };
    workspace: {
        workspaceId: string | null;
        workspaceName: string | null;
        snapshotId: string | null;
        action: string | null;
        activeWorkspaceId: string | null;
        posture: Record<string, unknown> | null;
        definition: Record<string, unknown> | null;
    };
    posture: {
        runCount: number;
        passRate: number;
        blockRate: number;
        regressionRate: number;
        latestVerdict: string | null;
        latestCoverageScore: number | null;
    };
    regressions: Array<{
        executionId: string;
        createdAt: string;
        source: string;
        actor: string;
        blockingDelta: number | null;
        advisoryDelta: number | null;
        trend: string;
    }>;
    hotspots: Array<{
        key: string;
        score: number;
        occurrences: number;
    }>;
    blockedExecutions: Array<{
        executionId: string;
        createdAt: string;
        type: string;
        source: string;
        actor: string;
        blocking: number;
        advisory: number;
        message: string | null;
    }>;
    timeline: Array<{
        timestamp: string;
        kind: 'execution' | 'evidence' | 'event' | 'control-plane' | 'workspace';
        id: string;
        summary: string;
        severity: ReplayRiskLevel;
        source: string;
    }>;
    events: ReplayRuntimeEventDigest[];
}
export interface ReplayExecutionDetail {
    schemaVersion: typeof REPLAY_EXECUTION_SCHEMA;
    generatedAt: string;
    executionId: string;
    rootDir: string;
    determinism: {
        immutableOnly: true;
        artifactHash: string;
        warnings: string[];
    };
    execution: ReplayExecutionDigest;
    timeline: Array<{
        stage: string;
        timestamp: string;
        message: string;
        details: Record<string, unknown> | null;
    }>;
    relatedEvents: ReplayRuntimeEventDigest[];
    relatedEvidence: ReplayEvidenceDigest[];
    predictedVsActual: {
        predictedRisk: ReplayRiskLevel | null;
        expectedImprovement: string | null;
        actualSuccess: boolean;
        actualTrend: string;
        blocking: number;
        advisory: number;
    };
    resultingPosture: {
        runCount: number;
        passRate: number;
        blockRate: number;
        regressionRate: number;
        latestVerdict: string | null;
    };
    reconstruction: GovernanceReplayState['reconstruction'];
}
export interface ReplayWorkspaceDetail {
    schemaVersion: typeof REPLAY_WORKSPACE_SCHEMA;
    generatedAt: string;
    asOf: string;
    rootDir: string;
    workspaceId: string | null;
    workspaceName: string | null;
    activeWorkspaceId: string | null;
    snapshotId: string | null;
    action: string | null;
    posture: Record<string, unknown> | null;
    definition: Record<string, unknown> | null;
    executionSummary: {
        total: number;
        succeeded: number;
        failed: number;
        passRate: number;
        blockRate: number;
    };
    hotspotSummary: Array<{
        key: string;
        score: number;
        occurrences: number;
    }>;
    recentEvents: ReplayRuntimeEventDigest[];
    determinism: {
        immutableOnly: true;
        artifactHash: string;
        warnings: string[];
    };
    reconstruction: GovernanceReplayState['reconstruction'];
}
export interface ReplayTimelineResult {
    schemaVersion: typeof REPLAY_TIMELINE_SCHEMA;
    generatedAt: string;
    rootDir: string;
    from: string | null;
    to: string | null;
    workspaceId: string | null;
    count: number;
    items: Array<{
        timestamp: string;
        kind: 'execution' | 'evidence' | 'event' | 'control-plane' | 'workspace';
        id: string;
        source: string;
        severity: ReplayRiskLevel;
        summary: string;
        executionId: string | null;
        workspaceId: string | null;
    }>;
    aggregate: {
        executions: number;
        evidence: number;
        runtimeEvents: number;
        controlPlane: number;
        workspace: number;
    };
    determinism: {
        immutableOnly: true;
        artifactHash: string;
        warnings: string[];
    };
}
export declare function replayGovernanceState(request: ReplayStateRequest, cwd?: string): GovernanceReplayState;
export declare function replayExecution(request: ReplayExecutionRequest, cwd?: string): ReplayExecutionDetail;
export declare function replayWorkspace(request: ReplayWorkspaceRequest, cwd?: string): ReplayWorkspaceDetail;
export declare function replayTimeline(request?: ReplayTimelineRequest, cwd?: string): ReplayTimelineResult;
export declare function getWorkspaceSnapshotHistory(cwd?: string, limit?: number): ReplayWorkspaceSnapshotDigest[];
export declare function writeWorkspaceReplaySnapshot(input: {
    cwd?: string;
    workspaceId: string;
    workspaceName: string;
    workspace: Record<string, unknown>;
    posture?: Record<string, unknown> | null;
    source: ExecutionSource;
    actor: string;
    action: string;
    executionId?: string | null;
    activeWorkspaceId?: string | null;
}): {
    snapshotId: string;
    snapshotPath: string;
};
export {};
//# sourceMappingURL=replay-runtime.d.ts.map