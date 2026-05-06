import type { ExecutionSource } from './execution-bus';
export type RuntimeEventType = 'execution.started' | 'execution.progress' | 'execution.completed' | 'execution.failed' | 'verification.completed' | 'regression.detected' | 'patch.applied' | 'hotspot.updated' | 'narrative.updated' | 'evidence.generated' | 'governance.config.updated';
export type RuntimeEventSeverity = 'low' | 'medium' | 'high';
export interface GovernanceRuntimeEvent {
    schemaVersion: 'neurcode.runtime-event.v1';
    id: string;
    cursor: string;
    type: RuntimeEventType;
    timestamp: string;
    executionId: string;
    source: ExecutionSource;
    actor: string;
    severity: RuntimeEventSeverity;
    payload: Record<string, unknown>;
}
export interface EmitRuntimeEventInput {
    type: RuntimeEventType;
    executionId: string;
    source: ExecutionSource;
    actor: string;
    severity: RuntimeEventSeverity;
    payload?: Record<string, unknown>;
    timestamp?: string;
}
export interface RuntimeEventQuery {
    limit?: number;
    cursor?: string;
    executionId?: string;
    type?: RuntimeEventType;
    source?: ExecutionSource;
    severity?: RuntimeEventSeverity;
}
export interface RuntimeEventQueryResult {
    items: GovernanceRuntimeEvent[];
    hasMore: boolean;
    nextCursor: string | null;
    scanned: number;
}
export declare function emitRuntimeEvent(cwd: string | undefined, input: EmitRuntimeEventInput): GovernanceRuntimeEvent;
export declare function queryRuntimeEvents(cwd?: string, query?: RuntimeEventQuery): RuntimeEventQueryResult;
export declare function getLatestRuntimeEventCursor(cwd?: string): string | null;
export declare function onRuntimeEvent(listener: (event: GovernanceRuntimeEvent) => void): () => void;
export declare function getRuntimeEventsFilePath(cwd?: string): string;
//# sourceMappingURL=runtime-events.d.ts.map