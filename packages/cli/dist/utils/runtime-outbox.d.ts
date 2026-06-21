export declare const RUNTIME_OUTBOX_SCHEMA_VERSION: "neurcode.runtime-outbox.v2";
export declare const LEGACY_RUNTIME_OUTBOX_SCHEMA_VERSION: "neurcode.runtime-outbox.v1";
export declare const RUNTIME_DELIVERY_SCHEMA_VERSION: "neurcode.runtime-delivery.v1";
export declare const RUNTIME_PRIVACY_AUDIT_SCHEMA_VERSION: "neurcode.runtime-privacy-audit.v1";
export declare const MAX_RUNTIME_OUTBOX_EVENTS = 1000;
export declare const MAX_RUNTIME_DEAD_LETTER_EVENTS = 100;
export declare const MAX_RUNTIME_DELIVERY_ATTEMPTS = 5;
export type RuntimeOutboxEventType = 'session_snapshot' | 'approval_ack' | 'scope_amendment_ack';
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
export interface RuntimeDeadLetterEvent extends RuntimeOutboxEvent {
    deadLetteredAt: string;
    deadLetterReason: string;
}
export interface RuntimePrivacyAuditReport {
    schemaVersion: typeof RUNTIME_PRIVACY_AUDIT_SCHEMA_VERSION;
    filesScanned: number;
    entriesScanned: number;
    safe: number;
    migrated: number;
    quarantined: number;
    quarantinedThisRun: number;
    quarantinedTotal: number;
    rejected: number;
    schemaVersions: string[];
    reasonCodeCounts: Record<string, number>;
    repairApplied: boolean;
    backupCreated: boolean;
    nextRecoveryAction: string;
}
export type RuntimeOutboxHealth = 'healthy' | 'queued' | 'retrying' | 'degraded';
export interface RuntimeOutboxStatus {
    schemaVersion: typeof RUNTIME_OUTBOX_SCHEMA_VERSION;
    health: RuntimeOutboxHealth;
    pendingEvents: number;
    pendingSessionSnapshots: number;
    pendingApprovalAcks: number;
    retryingEvents: number;
    deadLetterEvents: number;
    quarantinedEvents: number;
    deadLetterSessionSnapshots: number;
    deadLetterApprovalAcks: number;
    oldestPendingAt: string | null;
    nextRetryAt: string | null;
    lastEnqueuedAt: string | null;
    lastAttemptAt: string | null;
    lastDeliveredAt: string | null;
    lastDeliveredEventId: string | null;
    lastError: string | null;
    lastDeadLetteredAt: string | null;
    lastDeadLetteredEventId: string | null;
    lastDeadLetterError: string | null;
    lastRecoveredAt: string | null;
}
export declare function runtimeOutboxPath(repoRoot: string): string;
export declare function enqueueRuntimeSessionSnapshot(repoRoot: string, sessionId: string, payload: Record<string, unknown>): RuntimeOutboxEvent;
export declare function enqueueRuntimeApprovalAck(repoRoot: string, sessionId: string, payload: Record<string, unknown>): RuntimeOutboxEvent;
export declare function enqueueRuntimeScopeAmendmentAck(repoRoot: string, sessionId: string, payload: Record<string, unknown>): RuntimeOutboxEvent;
export declare function runtimeDeliveryEnvelope(event: RuntimeOutboxEvent): RuntimeDeliveryEnvelope;
export declare function pendingRuntimeOutboxEvents(repoRoot: string, options?: {
    limit?: number;
    force?: boolean;
    nowMs?: number;
}): RuntimeOutboxEvent[];
export declare function markRuntimeOutboxDelivered(repoRoot: string, eventId: string): void;
export declare function markRuntimeOutboxFailed(repoRoot: string, eventId: string, error: string): {
    deadLettered: boolean;
    attemptCount: number;
};
export declare function retryRuntimeDeadLetters(repoRoot: string, options?: {
    eventId?: string;
    limit?: number;
}): number;
export declare function inspectRuntimeOutbox(repoRoot: string): RuntimeOutboxStatus;
export declare function auditRuntimePrivacy(repoRoot: string, options?: {
    repair?: boolean;
}): RuntimePrivacyAuditReport;
//# sourceMappingURL=runtime-outbox.d.ts.map