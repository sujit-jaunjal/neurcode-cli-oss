export declare const RUNTIME_OUTBOX_SCHEMA_VERSION: "neurcode.runtime-outbox.v1";
export declare const RUNTIME_DELIVERY_SCHEMA_VERSION: "neurcode.runtime-delivery.v1";
export type RuntimeOutboxEventType = 'session_snapshot' | 'approval_ack';
export interface RuntimeDeliveryEnvelope {
    schemaVersion: typeof RUNTIME_DELIVERY_SCHEMA_VERSION;
    eventId: string;
    sessionId: string;
    sequence: number;
    eventType: RuntimeOutboxEventType;
    generatedAt: string;
    payloadHash: string;
}
export interface RuntimeOutboxEvent {
    schemaVersion: typeof RUNTIME_DELIVERY_SCHEMA_VERSION;
    eventId: string;
    sessionId: string;
    sequence: number;
    eventType: RuntimeOutboxEventType;
    generatedAt: string;
    payloadHash: string;
    payload: Record<string, unknown>;
    attemptCount: number;
    nextAttemptAt: string | null;
    lastAttemptAt: string | null;
    lastError: string | null;
}
export interface RuntimeOutboxStatus {
    schemaVersion: typeof RUNTIME_OUTBOX_SCHEMA_VERSION;
    pendingEvents: number;
    pendingSessionSnapshots: number;
    pendingApprovalAcks: number;
    oldestPendingAt: string | null;
    nextRetryAt: string | null;
    lastEnqueuedAt: string | null;
    lastAttemptAt: string | null;
    lastDeliveredAt: string | null;
    lastDeliveredEventId: string | null;
    lastError: string | null;
}
export declare function runtimeOutboxPath(repoRoot: string): string;
export declare function enqueueRuntimeSessionSnapshot(repoRoot: string, sessionId: string, payload: Record<string, unknown>): RuntimeOutboxEvent;
export declare function enqueueRuntimeApprovalAck(repoRoot: string, sessionId: string, payload: Record<string, unknown>): RuntimeOutboxEvent;
export declare function runtimeDeliveryEnvelope(event: RuntimeOutboxEvent): RuntimeDeliveryEnvelope;
export declare function pendingRuntimeOutboxEvents(repoRoot: string, options?: {
    limit?: number;
    force?: boolean;
    nowMs?: number;
}): RuntimeOutboxEvent[];
export declare function markRuntimeOutboxDelivered(repoRoot: string, eventId: string): void;
export declare function markRuntimeOutboxFailed(repoRoot: string, eventId: string, error: string): void;
export declare function inspectRuntimeOutbox(repoRoot: string): RuntimeOutboxStatus;
//# sourceMappingURL=runtime-outbox.d.ts.map