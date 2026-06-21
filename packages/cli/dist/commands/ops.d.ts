import type { Command } from 'commander';
interface OpsStatusOptions {
    apiUrl?: string;
    dashboardUrl?: string;
    npm?: boolean;
    timeoutMs?: string | number;
    strict?: boolean;
    json?: boolean;
}
interface ProbeResult {
    ok: boolean;
    status: 'pass' | 'warn' | 'fail';
    url: string;
    httpStatus: number | null;
    latencyMs: number | null;
    error: string | null;
    body?: any;
}
export type OpsCliVersionStatus = 'update_available' | 'current' | 'local_newer' | 'unknown';
export declare function compareOpsCliVersions(localVersion: string | null | undefined, registryVersion: string | null | undefined): OpsCliVersionStatus;
export declare function buildOpsStatus(options?: OpsStatusOptions): Promise<{
    schemaVersion: string;
    ok: boolean;
    generatedAt: string;
    cli: {
        package: string;
        version: string;
        npmLatest: any;
        registryVersion: string | null;
        releaseLatest: any;
        npmError: string | null;
        versionStatus: OpsCliVersionStatus;
        upToDate: boolean | null;
    };
    api: {
        url: string;
        health: ProbeResult;
        version: any;
        buildId: any;
        commit: any;
        deployedAt: any;
    };
    dashboard: {
        url: string;
        health: ProbeResult;
        buildId: any;
        commit: any;
        deployedAt: any;
    };
    runtimeBackend: any;
    runtimeOperations: {
        ingestion: {
            status?: "idle" | "healthy" | "watching" | "degraded" | string;
            reasons?: string[];
            received24h: number;
            accepted24h: number;
            staleRejected24h: number;
            unsequenced24h: number;
            duplicateObservationsTotal?: number;
            observationsTotal: number;
            lastReceivedAt: string | null;
            acceptanceRate24h?: number | null;
        };
        sessions: {
            status?: "idle" | "active" | "waiting_for_approval" | "stale" | string;
            reasons?: string[];
            active: number;
            finished: number;
            staleActive: number;
            blockedWaitingApproval: number;
            unsequencedActive: number;
            lastLiveSeenAt: string | null;
        } | null;
        approvals: {
            requested?: number;
            pending: number;
            actionablePending?: number;
            expired: number;
            applied: number;
            denied: number;
            revoked: number;
            failed: number;
            revocationPendingAck: number;
        } | null;
        scopeAmendments: {
            requested?: number;
            pending: number;
            expired: number;
            applied: number;
            denied: number;
            failed: number;
        } | null;
    } | null;
    runtimeOperationsError: string | null;
    release: any;
    migrationLedger: any;
    action: any;
    posture: {
        api: "pass" | "fail";
        dashboard: "pass" | "fail";
        runtimeBackend: any;
        npm: "warn" | "pass";
        receiptSigning: string;
    };
    privacy: {
        sourceUploaded: boolean;
        commandMode: string;
        uploadedFields: string[];
    };
}>;
export declare function renderOpsStatus(status: Awaited<ReturnType<typeof buildOpsStatus>>): string;
export declare function opsCommand(program: Command): void;
export {};
//# sourceMappingURL=ops.d.ts.map