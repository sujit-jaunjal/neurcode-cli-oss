import type { Command } from 'commander';
interface RuntimeSyncOptions {
    runtime?: boolean;
    dryRun?: boolean;
    since?: string;
    includeActive?: boolean;
    dir?: string;
    json?: boolean;
}
export declare function runtimeSyncCommand(options?: RuntimeSyncOptions): Promise<void>;
export declare function syncCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime-sync.d.ts.map