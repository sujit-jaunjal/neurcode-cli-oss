import type { Command } from 'commander';
interface RuntimeCloudStatusOptions {
    sessionId?: string;
    repoKey?: string;
    dir?: string;
    json?: boolean;
}
interface RuntimeResetStaleCloudOptions extends RuntimeCloudStatusOptions {
    reason?: string;
    force?: boolean;
}
export declare function runtimeCloudStatusCommand(options?: RuntimeCloudStatusOptions): Promise<void>;
export declare function runtimeResetStaleCloudCommand(options?: RuntimeResetStaleCloudOptions): Promise<void>;
export declare function runtimeCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime.d.ts.map