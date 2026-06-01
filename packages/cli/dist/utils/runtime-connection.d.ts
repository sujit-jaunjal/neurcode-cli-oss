import type { ProfileFreshnessSignal } from './v0-governance';
export interface RuntimeConnection {
    schemaVersion: 1;
    apiUrl: string;
    organizationId: string;
    projectId?: string | null;
    repo: {
        id: string;
        name: string;
        repoKey: string;
    };
    profileHash?: string;
    topologyHash?: string;
    keyPrefix?: string;
    connectedAt: string;
    autoSync: {
        enabled: boolean;
        lastQueuedAt?: string;
        lastAttemptAt?: string;
        lastSyncedAt?: string;
        lastStatus?: 'queued' | 'ok' | 'failed' | 'skipped';
        lastUploaded?: number;
        lastSkipped?: number;
        lastFailed?: number;
        lastError?: string;
    };
}
export interface RuntimeRepoMetadata {
    name: string;
    rootHash: string;
    remoteHash?: string;
    profileHash?: string;
    topologyHash?: string;
    profileFreshness?: ProfileFreshnessSignal;
    source: 'local';
}
export declare function runtimeConnectionPath(repoRoot: string): string;
export declare function collectRuntimeRepoMetadata(repoRoot: string, profileFreshness?: ProfileFreshnessSignal): RuntimeRepoMetadata;
export declare function loadRuntimeConnection(repoRoot: string): RuntimeConnection | null;
export declare function saveRuntimeConnection(repoRoot: string, connection: RuntimeConnection): void;
export declare function updateRuntimeConnection(repoRoot: string, update: (connection: RuntimeConnection) => RuntimeConnection): RuntimeConnection | null;
export declare function triggerRuntimeAutoSync(repoRoot: string): {
    started: boolean;
    reason?: string;
};
//# sourceMappingURL=runtime-connection.d.ts.map