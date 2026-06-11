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
interface RuntimeActionOptions extends RuntimeCloudStatusOptions {
    force?: boolean;
    limit?: string | number;
    offset?: string | number;
    status?: string;
}
type RuntimeLocalMode = 'strict' | 'advisory' | 'paused';
export declare function normalizeRuntimeActionStatus(value: unknown): string;
export declare function runtimeActionApiStatus(status: string): string;
export declare function filterRuntimeActionsForStatus<T extends {
    status: string;
}>(items: T[], status: string): T[];
export declare function runtimeCloudStatusCommand(options?: RuntimeCloudStatusOptions): Promise<void>;
export interface RuntimeHygieneOptions {
    dryRun?: boolean;
    reason?: string;
    json?: boolean;
}
export declare function runtimeHygieneCommand(options?: RuntimeHygieneOptions): Promise<void>;
export declare function runtimeResetStaleCloudCommand(options?: RuntimeResetStaleCloudOptions): Promise<void>;
export declare function runtimeActionsListCommand(options?: RuntimeActionOptions): Promise<void>;
export declare function runtimeActionsApplyCommand(options?: RuntimeActionOptions): Promise<void>;
export declare function runtimeEnforcementModeCommand(mode: RuntimeLocalMode, options?: {
    dir?: string;
    json?: boolean;
}): Promise<void>;
export declare function runtimeCommand(program: Command): void;
export {};
//# sourceMappingURL=runtime.d.ts.map