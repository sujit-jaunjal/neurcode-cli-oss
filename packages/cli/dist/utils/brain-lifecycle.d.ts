import type { RepositoryGraphFreshness, RepositoryGraphLimits, RepositoryIndexProgress, RepositoryIndexResult } from '@neurcode-ai/contracts';
export declare const BRAIN_LIFECYCLE_SCHEMA_VERSION: "neurcode.brain-lifecycle.v2";
export type BrainLifecycleState = 'missing' | 'scheduled' | 'building' | 'partial' | 'fresh' | 'stale' | 'failed' | 'unsupported';
export type BrainIndexSource = 'manual' | 'auto';
export interface BrainLifecycleStatus {
    schemaVersion: typeof BRAIN_LIFECYCLE_SCHEMA_VERSION;
    state: BrainLifecycleState;
    jobId: string | null;
    source: BrainIndexSource | null;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    pid: number | null;
    processStartFingerprint: string | null;
    processGroupId: number | null;
    detachedProcessGroup: boolean;
    elapsedMs: number | null;
    peakRssMb: number | null;
    peakRssMeasurement: 'sampled_process_rss' | 'unavailable';
    requestedLimits: Partial<RepositoryGraphLimits> | null;
    progress: {
        phase: RepositoryIndexProgress['phase'] | null;
        filesScanned: number;
        filesIndexed: number;
        totalFiles: number | null;
        bytesScanned: number;
        nodes: number;
        edges: number;
        percent: number | null;
    };
    freshness: RepositoryGraphFreshness | null;
    graphId: string | null;
    generation: number | null;
    reasonCodes: string[];
    unsupportedFacts: string[];
    recoveryCommands: {
        retry: string;
        cancel: string;
        selectiveRebuild: string;
        recover: string;
    };
}
export declare function brainLifecyclePath(repoRoot: string): string;
export declare function readBrainLifecycle(repoRoot: string): BrainLifecycleStatus | null;
export declare function writeBrainLifecycle(repoRoot: string, status: BrainLifecycleStatus): BrainLifecycleStatus;
export declare function inspectBrainLifecycle(repoRoot: string): Promise<BrainLifecycleStatus>;
export declare function beginBrainIndex(repoRoot: string, input: {
    source: BrainIndexSource;
    requestedLimits: Partial<RepositoryGraphLimits>;
    jobId?: string;
}): Promise<BrainLifecycleStatus>;
export declare function recordBrainProgress(repoRoot: string, jobId: string, progress: RepositoryIndexProgress): BrainLifecycleStatus | null;
export declare function markBrainIndexResult(repoRoot: string, result: RepositoryIndexResult, jobId?: string): BrainLifecycleStatus;
export declare function markBrainFailed(repoRoot: string, reasonCode: string, jobId?: string): BrainLifecycleStatus;
export declare function scheduleBrainIndex(repoRoot: string, options?: {
    force?: boolean;
    maxFiles?: number;
    maxTotalBytes?: number;
    maxBytesPerFile?: number;
}): Promise<BrainLifecycleStatus>;
export declare function cancelBrainIndex(repoRoot: string): Promise<BrainLifecycleStatus>;
//# sourceMappingURL=brain-lifecycle.d.ts.map