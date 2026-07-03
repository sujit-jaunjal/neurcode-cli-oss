/**
 * Default production API URL
 * Priority: NEURCODE_API_URL env var > Production URL
 * Users don't need to configure this - it's automatic
 */
export declare const DEFAULT_API_URL: string;
export interface NeurcodeConfig {
    apiUrl?: string;
    apiKey?: string;
    projectId?: string;
    orgId?: string;
    /**
     * Disable ApiClient's project-local org fallback for cross-workspace
     * discovery endpoints. Most API calls should keep the fallback enabled.
     */
    disableOrgHeaderFallback?: boolean;
}
export interface LocalGovernanceSigningMaterial {
    signingKey: string;
    signingKeyId: string;
    source: 'persisted' | 'generated';
}
/**
 * Resolve a local governance signing key from ~/.neurcoderc.
 * If authenticated and no key exists, auto-provision one for smoother
 * login-first onboarding in orgs that require signed AI logs.
 */
export declare function getOrCreateLocalGovernanceSigningMaterial(options?: {
    autoProvision?: boolean;
}): LocalGovernanceSigningMaterial | null;
/**
 * Return any persisted runtime credential without using the current repo's
 * workspace binding as a filter.
 *
 * This is intentionally narrower than loadConfig()/getApiKey(): it is used by
 * repo connection flows that first need to ask the API which workspaces the
 * authenticated user can actually access. A stale .neurcode/config.json should
 * not force a fresh browser login when the machine already has a valid runtime
 * credential for the same user.
 */
export declare function getAnyPersistedApiKey(): string | null;
export declare function loadConfig(): NeurcodeConfig;
/**
 * Get API key with helpful error message if not found
 */
export declare function getApiKey(orgId?: string): string | null;
/**
 * Require API key - throws helpful error if not found
 */
export declare function requireApiKey(orgId?: string): string;
/**
 * Save API key to global config file (~/.neurcoderc)
 * This is for user authentication, separate from project config
 */
export declare function saveGlobalAuth(apiKey: string, apiUrl?: string, organizationId?: string): void;
/**
 * Get global auth config path
 */
export declare function getGlobalAuthPath(): string;
/**
 * Delete global auth config (logout)
 */
export declare function deleteGlobalAuth(): void;
/**
 * Delete API key from all file-based config sources (logout)
 * This ensures logout works even if API key exists in multiple locations
 */
export declare function deleteApiKeyFromAllSources(options?: {
    orgId?: string;
    all?: boolean;
}): {
    removedFromGlobal: boolean;
    removedFromLocal: boolean;
    removedOrgIds?: string[];
};
//# sourceMappingURL=config.d.ts.map