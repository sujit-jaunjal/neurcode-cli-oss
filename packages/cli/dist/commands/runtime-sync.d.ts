import type { Command } from 'commander';
import { type RuntimeEvidenceUploadRequest } from '../api-client';
import { type LocalGovernanceSessionRecord } from '../utils/runtime-evidence';
interface RuntimeSyncOptions {
    runtime?: boolean;
    dryRun?: boolean;
    since?: string;
    includeActive?: boolean;
    retryDeadLetters?: boolean;
    dir?: string;
    json?: boolean;
}
export declare function buildRuntimeEvidenceUploadBatches(repoRoot: string, records: LocalGovernanceSessionRecord[]): RuntimeEvidenceUploadRequest[];
export declare function runtimeSyncCommand(options?: RuntimeSyncOptions): Promise<void>;
export declare function syncCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime-sync.d.ts.map