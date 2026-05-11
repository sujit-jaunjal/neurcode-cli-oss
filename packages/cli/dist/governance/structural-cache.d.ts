/**
 * Structural Analysis Cache (Phase 5 — Performance Stability)
 *
 * Persists rule-engine results to disk so that unchanged files are not
 * re-analyzed on every `verify` run. Provides consistent CI performance
 * independent of repo size.
 *
 * Cache design:
 *   Key:   file path (relative to project root)
 *   Value: { contentHash, rulesVersion, violations, analysisMs, cachedAt }
 *
 * Invalidation triggers:
 *   1. File content changes (SHA-256 of file content)
 *   2. Rules version changes (SHA-256 of all rule IDs + policyRefs)
 *
 * Storage: .neurcode/structural-cache.json
 * Write strategy: atomic (write to .tmp, then rename) to prevent corruption
 *   on process kill mid-write.
 *
 * This module is fully synchronous to stay compatible with the existing
 * structural-on-diff.ts read path.
 */
import type { StructuralViolation } from '../structural-rules/types';
export declare class StructuralCache {
    private readonly cacheFilePath;
    private store;
    private dirty;
    constructor(projectRoot: string);
    private load;
    /**
     * Check if a valid cache entry exists for the given file.
     *
     * @param filePath     Relative file path (cache key)
     * @param content      Current file content
     * @param rulesVersion Current rules fingerprint
     */
    get(filePath: string, content: string, rulesVersion: string): StructuralViolation[] | null;
    /**
     * Store analysis results for a file.
     */
    set(filePath: string, content: string, rulesVersion: string, violations: StructuralViolation[], analysisMs: number): void;
    /**
     * Invalidate a specific file entry (e.g. on explicit cache bust).
     */
    invalidate(filePath: string): void;
    /**
     * Flush dirty cache to disk (atomic write).
     * Safe to call even if nothing changed (no-op).
     */
    flush(): void;
    /**
     * Return cache diagnostics for the `neurcode cache diagnostics` command.
     */
    diagnostics(): {
        cacheFilePath: string;
        entryCount: number;
        totalCachedViolations: number;
        averageAnalysisMs: number;
        oldestEntry: string | null;
        newestEntry: string | null;
        staleRiskEntryCount: number;
        implementationHashCoveragePct: number;
    };
}
/**
 * Compute a stable two-tier fingerprint of the currently active rule set.
 *
 * Tier 1 (always): ruleId:policyRef — invalidates on rule additions/removals/policyRef changes
 * Tier 2 (when available): implementation hash — invalidates when rule logic changes
 *   without a policyRef change (e.g. PY003 logic rewrite keeping policyRef='P017')
 *
 * The combined fingerprint is:
 *   sha256(tier1 + '\n\x1e\n' + tier2).slice(0,16)
 *
 * If Tier 2 is unavailable (distDir not found), the fingerprint uses Tier 1 only
 * and the caller should set implementationHashAvailable=false in the cache entry.
 *
 * @param rules    Array of { id, policyRef } from the registered rule engine
 * @param distDir  Optional path to the CLI dist/governance/ directory for Tier 2
 */
export declare function computeRulesVersion(rules: Array<{
    id: string;
    policyRef: string;
}>, distDir?: string): {
    rulesVersion: string;
    implementationHash: string | null;
    implementationHashAvailable: boolean;
};
/**
 * Compute a hash of the compiled rule implementation files.
 *
 * Reads compiled .js files for each rule under distDir/structural-rules and
 * hashes the concatenated content. Changes when rule logic changes, even
 * if ruleId and policyRef are unchanged (two-tier fingerprinting).
 *
 * Falls back gracefully when files are unreadable. Returns null if distDir
 * does not exist or no rule implementation files are found.
 */
export declare function computeImplementationHash(rules: Array<{
    id: string;
    policyRef: string;
}>, distDir: string): string | null;
//# sourceMappingURL=structural-cache.d.ts.map