import type { Command } from 'commander';
interface ActivateOptions {
    force?: boolean;
    json?: boolean;
    dir?: string;
    mcp?: boolean;
    connect?: string;
    apiUrl?: string;
    autoSync?: boolean;
}
export interface ActivateResult {
    ok: boolean;
    agent: 'claude';
    repoRoot: string;
    profile: {
        status: string;
        refreshed: boolean;
        profileHash: string;
        topologyHash: string;
        trackedFileCount: number;
        path: string;
        reasons: string[];
    };
    claude: {
        hooksInstalled: boolean;
        settingsPath: string;
        hookEvents: Record<string, boolean>;
        mcpConfigured: boolean;
        mcpConfigPath: string;
    };
    connection?: {
        connected: boolean;
        apiUrl: string;
        organizationId: string;
        projectId?: string | null;
        repoId: string;
        repoName: string;
        repoKey: string;
        autoSyncEnabled: boolean;
        keyPrefix?: string;
    };
    next: string[];
}
export declare function activateClaudeCommand(options?: ActivateOptions): Promise<ActivateResult>;
export declare function activateCommand(program: Command): void;
export {};
//# sourceMappingURL=activate.d.ts.map