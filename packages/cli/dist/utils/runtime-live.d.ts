import { type GovernanceSession } from '@neurcode-ai/governance-runtime';
import { type RuntimeOutboxStatus } from './runtime-outbox';
import type { ProfileFreshnessSignal } from './v0-governance';
export interface RuntimeLiveApproval {
    id: string | null;
    sessionId: string;
    path: string;
    reason?: string | null;
    status: string;
    expiresAt?: string | null;
    requestedBy?: string | null;
    revokedBy?: string | null;
    revocationReason?: string | null;
}
export declare function publishRuntimeLiveStatus(repoRoot: string, session: GovernanceSession, options?: {
    profileFreshness?: ProfileFreshnessSignal;
    flushTimeoutMs?: number;
}): Promise<{
    ok: boolean;
    queued?: boolean;
    pending?: number;
    skipped?: string;
    error?: string;
}>;
export interface RuntimeLiveOutboxFlushResult {
    attempted: number;
    delivered: number;
    failed: number;
    deadLettered: number;
    pending: number;
    skipped?: string;
    lastError?: string;
    status: RuntimeOutboxStatus;
}
export declare function flushRuntimeLiveOutbox(repoRoot: string, options?: {
    maxEvents?: number;
    timeoutMs?: number;
    force?: boolean;
}): Promise<RuntimeLiveOutboxFlushResult>;
export declare function findRuntimeLiveApprovalRequest(repoRoot: string, sessionId: string, path: string): Promise<RuntimeLiveApproval | null>;
export declare function queueRuntimeLiveApprovalAppliedAck(repoRoot: string, sessionId: string, approval: RuntimeLiveApproval, body: {
    appliedPath: string;
    expiresAt?: string | null;
}): void;
export declare function applyPendingRuntimeLiveActions(repoRoot: string, sessionId: string): Promise<{
    applied: number;
    revoked: number;
    scopeAmended: number;
    scopeDenied: number;
    failed: number;
}>;
export declare function applyPendingRuntimeLiveApprovals(repoRoot: string, sessionId: string): Promise<{
    applied: number;
    revoked: number;
    scopeAmended: number;
    scopeDenied: number;
    failed: number;
}>;
//# sourceMappingURL=runtime-live.d.ts.map