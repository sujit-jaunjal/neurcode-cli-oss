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
type ActivateAgent = 'claude' | 'copilot' | 'codex' | 'cursor' | 'vscode' | 'action';
export interface ActivateResult {
    ok: boolean;
    agent: ActivateAgent;
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
    claude?: {
        hooksInstalled: boolean;
        settingsPath: string;
        hookEvents: Record<string, boolean>;
        /** Hook events freshly added (no prior Neurcode hook). */
        hooksAdded: string[];
        /** Hook events left untouched because they were already current. */
        hooksPreserved: string[];
        /** Hook events whose stale/older Neurcode command was replaced. */
        hooksRepaired: string[];
        mcpConfigured: boolean;
        mcpPresent: boolean;
        mcpStale: boolean;
        mcpConfigPath: string;
        mcpAdded: string[];
        mcpPreserved: string[];
        mcpRepaired: string[];
        mcpRestartRequired: boolean;
        mcpStaleReasons: string[];
    };
    copilot?: {
        hooksInstalled: boolean;
        hooksPath: string;
        hookEvents: Record<string, boolean>;
        hooksAdded: string[];
        hooksPreserved: string[];
        hooksRepaired: string[];
    };
    /** True when hooks or MCP config changed; if Claude Code was already open, restart/reload it. */
    restartRequired: boolean;
    /** The exact command an operator should run next to confirm live governance. */
    nextCheck: string;
    compatibility?: {
        label: string;
        controlLevel: string;
        enforced: string[];
        advisory: string[];
        commands: string[];
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
export declare function activateCopilotCommand(options?: ActivateOptions): Promise<ActivateResult>;
export declare function activateCompatibilityCommand(agent: Exclude<ActivateAgent, 'claude' | 'copilot'>, options?: ActivateOptions): Promise<ActivateResult>;
export declare function activateCommand(program: Command): void;
export {};
//# sourceMappingURL=activate.d.ts.map