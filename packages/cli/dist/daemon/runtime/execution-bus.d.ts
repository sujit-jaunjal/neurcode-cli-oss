import { type ExecutionActionClass, type ExecutionActionType } from '../../utils/execution-actions';
export type { ExecutionActionClass, ExecutionActionType } from '../../utils/execution-actions';
export type ExecutionSource = 'cli' | 'daemon' | 'dashboard' | 'vscode' | 'ci' | 'mcp' | 'cursor' | 'api' | 'unknown';
export type ExecutionStatus = 'queued' | 'validating' | 'executing' | 'verifying' | 'evidence' | 'narrating' | 'completed' | 'failed';
export interface ExecutionCounts {
    blocking: number;
    advisory: number;
}
export interface ExecutionVerificationSnapshot {
    verdict: string;
    grade?: string;
    score?: number | null;
    summary?: unknown;
    counts: ExecutionCounts;
}
export interface ExecutionVerificationDiff {
    before: ExecutionCounts | null;
    after: ExecutionCounts | null;
    blockingDelta: number | null;
    advisoryDelta: number | null;
    trend: 'improved' | 'regressed' | 'unchanged' | 'baseline';
}
export interface ExecutionVerificationBundle {
    before: ExecutionVerificationSnapshot | null;
    after: ExecutionVerificationSnapshot | null;
    diff: ExecutionVerificationDiff;
}
export interface ExecutionNarrative {
    status: 'success' | 'warning' | 'failure';
    summary: string;
    why: string;
    riskLevel: 'low' | 'medium' | 'high';
    recommendedAction: string;
    expectedImprovement: string;
}
export interface ExecutionRecord {
    schemaVersion: 'neurcode.execution.v1';
    id: string;
    fingerprint: string;
    type: ExecutionActionType;
    actor: string;
    source: ExecutionSource;
    target: string | null;
    status: ExecutionStatus;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    result: {
        success: boolean;
        exitCode: number;
        command: string[];
        message: string | null;
        payload: Record<string, unknown> | null;
        stderr: string | null;
    } | null;
    verification: ExecutionVerificationBundle;
    evidence: {
        references: string[];
        generated: boolean;
        retentionLimit: number;
    };
    narrative: ExecutionNarrative | null;
    runtime: {
        cwd: string;
        nodeVersion: string;
        platform: string;
        arch: string;
        ciMode?: boolean;
        executionClass: ExecutionActionClass;
    };
    events: ExecutionStageEvent[];
}
export interface ExecutionStageEvent {
    timestamp: string;
    stage: ExecutionStatus;
    message: string;
    details?: Record<string, unknown>;
}
export interface ExecutionRequest {
    type: ExecutionActionType;
    source?: ExecutionSource;
    actor?: string;
    target?: string | null;
    intentText?: string | null;
    cwd?: string;
    reverify?: boolean;
    ciMode?: boolean;
    dedupeWindowMs?: number;
    primaryArgs?: string[];
    baselineVerifyArgs?: string[];
    reverifyArgs?: string[];
    evidenceDir?: string;
    evidenceRetentionLimit?: number;
    maxLockMs?: number;
}
export interface RunExecutionResult {
    execution: ExecutionRecord;
    primaryPayload: Record<string, unknown> | null;
    verificationPayload: Record<string, unknown> | null;
}
export interface SyntheticExecutionInput {
    type: ExecutionActionType;
    source?: ExecutionSource;
    actor?: string;
    target?: string | null;
    cwd?: string;
    status?: 'completed' | 'failed';
    success?: boolean;
    message?: string | null;
    payload?: Record<string, unknown> | null;
    stderr?: string | null;
    verification?: {
        verdict?: string;
        grade?: string;
        score?: number | null;
        summary?: unknown;
        counts?: Partial<ExecutionCounts>;
    } | null;
    evidenceReferences?: string[];
    evidenceRetentionLimit?: number;
    narrative?: Partial<ExecutionNarrative> | null;
    ciMode?: boolean;
    command?: string[];
    eventDetails?: Record<string, unknown>;
}
export type ExecutionSeverityFilter = 'all' | 'blocking' | 'advisory' | 'high' | 'medium' | 'low';
export interface QueryExecutionsOptions {
    limit?: number;
    offset?: number;
    q?: string;
    type?: ExecutionActionType | 'all';
    source?: ExecutionSource | 'all';
    status?: ExecutionStatus | 'all';
    actor?: string;
    severity?: ExecutionSeverityFilter;
    from?: string;
    to?: string;
}
export interface QueryExecutionsResult {
    items: ExecutionRecord[];
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number;
    scanned: number;
}
export interface ExecutionTimelineStage {
    stage: ExecutionStatus;
    message: string;
    startedAt: string;
    endedAt: string;
    durationMs: number;
}
export interface ExecutionTimeline {
    id: string;
    status: ExecutionStatus;
    startedAt: string | null;
    completedAt: string | null;
    totalDurationMs: number | null;
    stages: ExecutionTimelineStage[];
}
export interface ExecutionDiffFinding {
    file: string | null;
    message: string;
    severity: string | null;
    rule: string | null;
}
export interface ExecutionDiffInspection {
    id: string;
    type: ExecutionActionType;
    source: ExecutionSource;
    actor: string;
    target: string | null;
    command: string[];
    predictedOutcome: {
        riskLevel: 'low' | 'medium' | 'high' | null;
        expectedImprovement: string | null;
    };
    actualOutcome: {
        success: boolean;
        trend: ExecutionVerificationDiff['trend'];
        blockingDelta: number | null;
        advisoryDelta: number | null;
    };
    beforeAfter: {
        before: ExecutionCounts | null;
        after: ExecutionCounts | null;
    };
    findings: ExecutionDiffFinding[];
    patch: {
        available: boolean;
        file: string | null;
        changed: boolean | null;
        status: string | null;
        confidence: string | null;
        patternKind: string | null;
        diffPreview: string | null;
        diffHash: string | null;
        receipt: {
            transactionId: string | null;
            transactionHash: string | null;
            rollbackSnapshotId: string | null;
            rollbackAvailable: boolean | null;
            stalePreviewRejected: boolean | null;
            staleReason: string | null;
        } | null;
    };
}
export declare function runExecution(request: ExecutionRequest): Promise<RunExecutionResult>;
export declare function recordSyntheticExecution(input: SyntheticExecutionInput): ExecutionRecord;
export declare function queryExecutions(cwd?: string, options?: QueryExecutionsOptions): QueryExecutionsResult;
export declare function listExecutions(cwd?: string, limit?: number): ExecutionRecord[];
export declare function buildExecutionTimeline(record: ExecutionRecord): ExecutionTimeline;
export declare function buildExecutionDiffInspection(record: ExecutionRecord): ExecutionDiffInspection;
export declare function getExecutionById(executionId: string, cwd?: string): ExecutionRecord | null;
//# sourceMappingURL=execution-bus.d.ts.map