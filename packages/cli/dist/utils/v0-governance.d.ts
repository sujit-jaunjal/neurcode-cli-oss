import { type ModuleImportRecord, type RepoGovernanceProfile, type RuntimeGovernanceConfig } from '@neurcode-ai/governance-runtime';
export declare const CODEOWNERS_CANDIDATES: string[];
export declare const MANIFEST_CANDIDATES: string[];
export declare const CLAUDE_GOVERNANCE_HOOKS: {
    readonly UserPromptSubmit: readonly [{
        readonly hooks: readonly [{
            readonly type: "command";
            readonly command: "neurcode session-hook start";
        }];
    }];
    readonly PreToolUse: readonly [{
        readonly matcher: "Edit|Write|MultiEdit";
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
}
export interface ClaudeMcpResult {
    configPath: string;
    added: string[];
    preserved: string[];
}
export interface ClaudeActivationInspection {
    hooks: {
        installed: boolean;
        settingsPath: string;
        events: Record<keyof typeof CLAUDE_GOVERNANCE_HOOKS, boolean>;
        error?: string;
    };
    mcp: {
        configured: boolean;
        configPath: string;
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
export declare function buildCurrentGovernanceProfile(repoRoot: string): RepoGovernanceProfile;
export declare function profilePath(repoRoot: string): string;
export declare function readGovernanceProfile(repoRoot: string): ProfileReadResult;
export declare function writeGovernanceProfile(repoRoot: string, profile: RepoGovernanceProfile): string;
export declare function buildProfileFreshnessSignal(result: ProfileStalenessResult | EnsureProfileResult, action?: ProfileFreshnessAction): ProfileFreshnessSignal;
export declare function profileFreshnessActionForSession(result: ProfileStalenessResult | EnsureProfileResult, sessionProfileHash: string | null | undefined): ProfileFreshnessAction;
export declare function getProfileStaleness(repoRoot: string): ProfileStalenessResult;
export declare function ensureFreshGovernanceProfile(repoRoot: string, options?: {
    force?: boolean;
}): EnsureProfileResult;
export declare function installClaudeGovernanceHooks(repoRoot: string, options?: {
    force?: boolean;
    dryRun?: boolean;
}): ClaudeHooksResult;
export declare function installClaudeMcpConfig(options?: {
    force?: boolean;
    dryRun?: boolean;
    homeDir?: string;
}): ClaudeMcpResult;
export declare function inspectClaudeActivation(repoRoot: string, options?: {
    homeDir?: string;
}): ClaudeActivationInspection;
//# sourceMappingURL=v0-governance.d.ts.map