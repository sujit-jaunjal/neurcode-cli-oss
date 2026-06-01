import { type GovernanceSession } from '@neurcode-ai/governance-runtime';
export interface LocalGovernanceSessionRecord {
    session: GovernanceSession;
    path: string;
    startedAt: string | null;
    blockCount: number;
    warnCount: number;
    okCount: number;
    approvalCount: number;
}
export interface RuntimeEvidenceReport {
    repoRoot: string;
    generatedAt: string;
    since: string | null;
    profile: {
        status: string;
        profilePath: string;
        reasons: string[];
    };
    summary: {
        sessions: number;
        activeSessions: number;
        finishedSessions: number;
        totalChecks: number;
        blockedEdits: number;
        warnedSensitiveEdits: number;
        allowedEdits: number;
        approvalsGranted: number;
    };
    topBlockedPaths: Array<{
        path: string;
        count: number;
    }>;
    topOwners: Array<{
        owner: string;
        count: number;
    }>;
    approvalRequiredBoundariesTouched: Array<{
        boundary: string;
        count: number;
    }>;
    sessions: Array<{
        sessionId: string;
        status: GovernanceSession['status'];
        goal: string;
        scopeMode: GovernanceSession['contract']['scopeMode'];
        blockCount: number;
        warnCount: number;
        okCount: number;
        approvalCount: number;
        approvedPaths: string[];
        replayHash?: string;
        recordPath: string;
    }>;
}
export declare function parseSinceDuration(input?: string): {
    cutoffMs: number | null;
    label: string | null;
};
export declare function listRuntimeSessions(repoRoot: string, options?: {
    since?: string;
}): LocalGovernanceSessionRecord[];
export declare function buildRuntimeEvidenceReport(repoRoot: string, options?: {
    since?: string;
}): RuntimeEvidenceReport;
export declare function renderRuntimeEvidenceMarkdown(report: RuntimeEvidenceReport): string;
//# sourceMappingURL=runtime-evidence.d.ts.map