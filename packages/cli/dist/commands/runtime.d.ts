import type { Command } from 'commander';
interface RuntimeCloudStatusOptions {
    sessionId?: string;
    repoKey?: string;
    dir?: string;
    json?: boolean;
}
export declare function runtimeCloudStatusCommand(options?: RuntimeCloudStatusOptions): Promise<void>;
export declare function runtimeCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime.d.ts.map