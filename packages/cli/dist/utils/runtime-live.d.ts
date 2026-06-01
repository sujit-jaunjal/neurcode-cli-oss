import { type GovernanceSession } from '@neurcode-ai/governance-runtime';
import type { ProfileFreshnessSignal } from './v0-governance';
export declare function publishRuntimeLiveStatus(repoRoot: string, session: GovernanceSession, options?: {
    profileFreshness?: ProfileFreshnessSignal;
}): Promise<{
    ok: boolean;
    skipped?: string;
    error?: string;
}>;
export declare function applyPendingRuntimeLiveApprovals(repoRoot: string, sessionId: string): Promise<{
    applied: number;
    failed: number;
}>;
//# sourceMappingURL=runtime-live.d.ts.map