import { type GovernanceSession } from '@neurcode-ai/governance-runtime';
import { type RuntimeOutboxStatus } from './runtime-outbox';
import type { ProfileFreshnessSignal } from './v0-governance';
export declare function publishRuntimeLiveStatus(repoRoot: string, session: GovernanceSession, options?: {
    profileFreshness?: ProfileFreshnessSignal;
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
export declare function applyPendingRuntimeLiveApprovals(repoRoot: string, sessionId: string): Promise<{
    applied: number;
    revoked: number;
    failed: number;
}>;
//# sourceMappingURL=runtime-live.d.ts.map