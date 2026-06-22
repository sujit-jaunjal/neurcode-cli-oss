import type { RepositoryGraphFreshness, RepositoryIndexResult } from '@neurcode-ai/contracts';
export declare const BRAIN_LIFECYCLE_SCHEMA_VERSION: "neurcode.brain-lifecycle.v1";
export type BrainLifecycleState = 'missing' | 'scheduled' | 'building' | 'partial' | 'fresh' | 'stale' | 'failed' | 'unsupported';
export interface BrainLifecycleStatus {
    schemaVersion: typeof BRAIN_LIFECYCLE_SCHEMA_VERSION;
    state: BrainLifecycleState;
    updatedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    pid: number | null;
    progress: {
        filesScanned: number;
        filesIndexed: number;
        totalFiles: number | null;
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
export declare function markBrainBuilding(repoRoot: string): BrainLifecycleStatus;
export declare function markBrainIndexResult(repoRoot: string, result: RepositoryIndexResult): BrainLifecycleStatus;
export declare function markBrainFailed(repoRoot: string, reasonCode: string): BrainLifecycleStatus;
export declare function scheduleBrainIndex(repoRoot: string, options?: {
    force?: boolean;
    maxFiles?: number;
    maxTotalBytes?: number;
    maxBytesPerFile?: number;
}): Promise<BrainLifecycleStatus>;
export declare function cancelBrainIndex(repoRoot: string): BrainLifecycleStatus;
//# sourceMappingURL=brain-lifecycle.d.ts.map