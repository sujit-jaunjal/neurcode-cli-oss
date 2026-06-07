import { type ModuleImportRecord, type RepoGovernanceProfile, type RuntimeGovernanceConfig } from '@neurcode-ai/governance-runtime';
export declare const CODEOWNERS_CANDIDATES: string[];
export declare const MANIFEST_CANDIDATES: string[];
declare const COPILOT_HOOK_EVENTS: readonly ["UserPromptSubmit", "PreToolUse", "Stop"];
type CopilotHookEvent = typeof COPILOT_HOOK_EVENTS[number];
export declare const CLAUDE_GOVERNANCE_HOOKS: {
    readonly UserPromptSubmit: readonly [{
        readonly hooks: readonly [{
            readonly type: "command";
            readonly command: "neurcode session-hook start";
        }];
    }];
    readonly PreToolUse: readonly [{
        readonly matcher: "Bash|Edit|Write|MultiEdit";
        readonly hooks: readonly [{
            readonly type: "command";
            readonly command: "neurcode session-hook check";
        }];
    }];
    readonly Stop: readonly [{
        readonly hooks: readonly [{
            readonly type: "command";
            readonly command: "neurcode session-hook finish";
        }];
    }];
};
type ClaudeHookEvent = keyof typeof CLAUDE_GOVERNANCE_HOOKS;
export type ProfileFreshness = 'missing' | 'fresh' | 'stale' | 'unreadable';
export interface ProfileReadResult {
    profile: RepoGovernanceProfile | null;
    path: string;
    error?: string;
}
export interface ProfileStalenessResult {
    status: ProfileFreshness;
    profilePath: string;
    cachedProfile: RepoGovernanceProfile | null;
    currentProfile: RepoGovernanceProfile;
    reasons: string[];
    /** True when an in-process staleness snapshot was reused (5 min TTL). */
    profileCacheHit?: boolean;
}
export interface EnsureProfileResult extends ProfileStalenessResult {
    profile: RepoGovernanceProfile;
    refreshed: boolean;
}
export type ProfileFreshnessAction = 'none' | 'auto_refreshed' | 'session_restart_required' | 'manual_refresh_required';
export interface ProfileFreshnessSignal {
    status: ProfileFreshness;
    refreshed: boolean;
    action: ProfileFreshnessAction;
    checkedAt: string;
    profilePath: string;
    reasons: string[];
    cachedProfileHash?: string;
    cachedTopologyHash?: string;
    currentProfileHash: string;
    currentTopologyHash: string;
    trackedFileCount: number;
}
export interface ClaudeHooksResult {
    settingsPath: string;
    added: string[];
    preserved: string[];
    /** Events whose existing (stale/older) Neurcode hook command was replaced. */
    repaired: string[];
    /**
     * True when hooks were added or repaired. If Claude Code was already open in this
     * repo, the running session loaded the old hooks and must be restarted to pick these up.
     */
    restartRequired: boolean;
}
export interface CopilotHooksResult {
    hooksPath: string;
    added: string[];
    preserved: string[];
    repaired: string[];
    restartRequired: boolean;
}
export interface ClaudeMcpResult {
    configPath: string;
    added: string[];
    preserved: string[];
    /** Existing Neurcode MCP entry was present but wrong/stale and was replaced. */
    repaired: string[];
    /**
     * True when the MCP config changed. Claude Code may need its MCP servers
     * reloaded/restarted before the approval tool appears in the running app.
     */
    restartRequired: boolean;
}
export interface ClaudeActivationInspection {
    hooks: {
        installed: boolean;
        settingsPath: string;
        events: Record<ClaudeHookEvent, boolean>;
        expectedCommands: Record<ClaudeHookEvent, string>;
        stale: boolean;
        staleCommands: string[];
        /** The installed PreToolUse command string, if any. */
        installedCommand: string | null;
        /** Entrypoint path parsed from the installed pinned command (`node "<path>" ...`), or null when bare. */
        entrypoint: string | null;
        /** Whether the parsed entrypoint exists on disk. null when there is no pinned entrypoint to check. */
        entrypointExists: boolean | null;
        /**
         * Whether the pinned entrypoint is portable (repo-relative). Absolute machine paths
         * are not portable across machines/CI/teammates. null when there is no entrypoint.
         */
        entrypointPortable: boolean | null;
        error?: string;
    };
    mcp: {
        /** True only when the neurcode MCP entry matches the expected approval server. */
        configured: boolean;
        /** True when a neurcode MCP key exists, even if it is stale/wrong. */
        present: boolean;
        /** True when a neurcode MCP key exists but does not match the expected server. */
        stale: boolean;
        configPath: string;
        entry: {
            command?: string;
            args?: string[];
        } | null;
        expectedEntry: {
            command: string;
            args: string[];
        };
        staleReasons: string[];
        error?: string;
    };
}
export interface CopilotActivationInspection {
    hooks: {
        installed: boolean;
        hooksPath: string;
        events: Record<CopilotHookEvent, boolean>;
        expectedCommands: Record<CopilotHookEvent, string>;
        stale: boolean;
        staleCommands: string[];
        installedCommand: string | null;
        entrypoint: string | null;
        entrypointExists: boolean | null;
        entrypointPortable: boolean | null;
        error?: string;
    };
}
export interface GovernanceConfigReadResult {
    path: string;
    exists: boolean;
    config: RuntimeGovernanceConfig;
    error?: string;
}
export declare function resolveRepoRoot(cwd?: string): string;
export declare function gitLsFiles(cwd: string): string[];
export declare function governanceConfigPath(repoRoot: string): string;
export declare function readRuntimeGovernanceConfig(repoRoot: string): GovernanceConfigReadResult;
/**
 * Read per-file import specifiers from the local working tree. Source-free
 * output: returns only module specifier strings (e.g. "../billing/charge"),
 * never file contents. Bounded + deterministic.
 */
export declare function readModuleImports(repoRoot: string, paths: string[]): ModuleImportRecord[];
export declare const PROFILE_STALENESS_CACHE_TTL_MS: number;
export declare function buildCurrentGovernanceProfile(repoRoot: string, options?: {
    bypassCache?: boolean;
}): RepoGovernanceProfile;
export declare function profilePath(repoRoot: string): string;
export declare function readGovernanceProfile(repoRoot: string): ProfileReadResult;
export declare function writeGovernanceProfile(repoRoot: string, profile: RepoGovernanceProfile): string;
export declare function buildProfileFreshnessSignal(result: ProfileStalenessResult | EnsureProfileResult, action?: ProfileFreshnessAction): ProfileFreshnessSignal;
export declare function profileFreshnessActionForSession(result: ProfileStalenessResult | EnsureProfileResult, sessionProfileHash: string | null | undefined): ProfileFreshnessAction;
export declare function getLastProfileCacheHit(): boolean;
export declare function clearProfileStalenessCache(repoRoot?: string): void;
export declare function getProfileStaleness(repoRoot: string, options?: {
    bypassCache?: boolean;
}): ProfileStalenessResult;
export declare function ensureFreshGovernanceProfile(repoRoot: string, options?: {
    force?: boolean;
    bypassCache?: boolean;
}): EnsureProfileResult;
/**
 * Parse the node entrypoint path out of a pinned hook command.
 * Pinned form: `node "<entrypoint>" session-hook <sub>` (entrypoint may be quoted or bare).
 * Returns null for the legacy bare `neurcode session-hook <sub>` form (no entrypoint to verify).
 */
export declare function parseHookEntrypoint(command: string): string | null;
export declare function installClaudeGovernanceHooks(repoRoot: string, options?: {
    force?: boolean;
    dryRun?: boolean;
}): ClaudeHooksResult;
export declare function copilotHooksPath(repoRoot: string): string;
export declare function installCopilotGovernanceHooks(repoRoot: string, options?: {
    force?: boolean;
    dryRun?: boolean;
}): CopilotHooksResult;
export declare function installClaudeMcpConfig(options?: {
    force?: boolean;
    dryRun?: boolean;
    homeDir?: string;
}): ClaudeMcpResult;
export declare function inspectClaudeActivation(repoRoot: string, options?: {
    homeDir?: string;
}): ClaudeActivationInspection;
export declare function inspectCopilotActivation(repoRoot: string): CopilotActivationInspection;
export {};
//# sourceMappingURL=v0-governance.d.ts.map