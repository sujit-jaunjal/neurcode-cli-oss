"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructuralCache = void 0;
exports.computeRulesVersion = computeRulesVersion;
exports.computeImplementationHash = computeImplementationHash;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const artifact_io_1 = require("../utils/artifact-io");
// ── Constants ─────────────────────────────────────────────────────────────────
const CACHE_FILE = 'structural-cache.json';
const NEURCODE_DIR = '.neurcode';
const CACHE_VERSION = 1;
// ── Helpers ───────────────────────────────────────────────────────────────────
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input, 'utf-8').digest('hex');
}
function atomicWrite(filePath, content) {
    (0, artifact_io_1.atomicWriteUtf8FileSync)(filePath, content, { fsync: false });
}
// ── StructuralCache class ─────────────────────────────────────────────────────
class StructuralCache {
    cacheFilePath;
    store;
    dirty = false;
    constructor(projectRoot) {
        this.cacheFilePath = (0, path_1.join)(projectRoot, NEURCODE_DIR, CACHE_FILE);
        this.store = this.load();
    }
    // ── Load ────────────────────────────────────────────────────────────────────
    load() {
        if (!(0, fs_1.existsSync)(this.cacheFilePath)) {
            return { version: CACHE_VERSION, entries: {} };
        }
        try {
            const raw = (0, fs_1.readFileSync)(this.cacheFilePath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' &&
                parsed !== null &&
                parsed.version === CACHE_VERSION &&
                typeof parsed.entries === 'object') {
                return parsed;
            }
        }
        catch {
            // Corrupt cache — start fresh
        }
        return { version: CACHE_VERSION, entries: {} };
    }
    // ── Public API ──────────────────────────────────────────────────────────────
    /**
     * Check if a valid cache entry exists for the given file.
     *
     * @param filePath     Relative file path (cache key)
     * @param content      Current file content
     * @param rulesVersion Current rules fingerprint
     */
    get(filePath, content, rulesVersion) {
        const entry = this.store.entries[filePath];
        if (!entry)
            return null;
        const contentHash = sha256(content);
        if (entry.contentHash !== contentHash)
            return null;
        if (entry.rulesVersion !== rulesVersion)
            return null;
        return entry.violations;
    }
    /**
     * Store analysis results for a file.
     */
    set(filePath, content, rulesVersion, violations, analysisMs) {
        const contentHash = sha256(content);
        this.store.entries[filePath] = {
            contentHash,
            rulesVersion,
            violations,
            analysisMs,
            cachedAt: new Date().toISOString(),
        };
        this.dirty = true;
    }
    /**
     * Invalidate a specific file entry (e.g. on explicit cache bust).
     */
    invalidate(filePath) {
        if (this.store.entries[filePath]) {
            delete this.store.entries[filePath];
            this.dirty = true;
        }
    }
    /**
     * Flush dirty cache to disk (atomic write).
     * Safe to call even if nothing changed (no-op).
     */
    flush() {
        if (!this.dirty)
            return;
        try {
            atomicWrite(this.cacheFilePath, JSON.stringify(this.store, null, 2));
            this.dirty = false;
        }
        catch {
            // Non-fatal — cache write failure degrades to uncached analysis
        }
    }
    /**
     * Return cache diagnostics for the `neurcode cache diagnostics` command.
     */
    diagnostics() {
        const entries = Object.values(this.store.entries);
        const totalViolations = entries.reduce((s, e) => s + e.violations.length, 0);
        const totalMs = entries.reduce((s, e) => s + e.analysisMs, 0);
        const dates = entries.map(e => e.cachedAt).sort();
        const staleRiskCount = entries.filter(e => e.staleRisk === true || e.implementationHashAvailable === false).length;
        const withImplHash = entries.filter(e => e.implementationHashAvailable === true).length;
        return {
            cacheFilePath: this.cacheFilePath,
            entryCount: entries.length,
            totalCachedViolations: totalViolations,
            averageAnalysisMs: entries.length > 0 ? Math.round(totalMs / entries.length) : 0,
            oldestEntry: dates[0] ?? null,
            newestEntry: dates[dates.length - 1] ?? null,
            staleRiskEntryCount: staleRiskCount,
            implementationHashCoveragePct: entries.length > 0
                ? Math.round((withImplHash / entries.length) * 100)
                : 100,
        };
    }
}
exports.StructuralCache = StructuralCache;
// ── Rules version fingerprint ─────────────────────────────────────────────────
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
function computeRulesVersion(rules, distDir) {
    // Tier 1: ruleId:policyRef fingerprint
    const tier1 = rules
        .map(r => `${r.id}:${r.policyRef}`)
        .sort()
        .join('\n');
    const tier1Hash = sha256(tier1);
    // Tier 2: compiled implementation hash
    const implHash = distDir ? computeImplementationHash(rules, distDir) : null;
    const combined = implHash
        ? sha256(`${tier1Hash}\n\x1e\n${implHash}`).slice(0, 16)
        : tier1Hash.slice(0, 16);
    return {
        rulesVersion: combined,
        implementationHash: implHash,
        implementationHashAvailable: implHash !== null,
    };
}
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
function computeImplementationHash(rules, distDir) {
    if (!(0, fs_1.existsSync)(distDir))
        return null;
    const hasher = (0, crypto_1.createHash)('sha256');
    let filesHashed = 0;
    // Sort rules for deterministic hash order
    const sortedRules = [...rules].sort((a, b) => a.id.localeCompare(b.id));
    for (const rule of sortedRules) {
        const ruleIdLower = rule.id.toLowerCase();
        const rulesBase = (0, path_1.join)(distDir, 'structural-rules');
        // Check direct rule file
        const targetFile = `${ruleIdLower}.js`;
        let found = false;
        if ((0, fs_1.existsSync)(rulesBase)) {
            try {
                const files = (0, fs_1.readdirSync)(rulesBase);
                const match = files.find(f => f.toLowerCase() === targetFile);
                if (match) {
                    hasher.update(`${rule.id}:`);
                    hasher.update((0, fs_1.readFileSync)((0, path_1.join)(rulesBase, match)));
                    filesHashed++;
                    found = true;
                }
            }
            catch {
                // Skip unreadable directory
            }
        }
        if (!found) {
            hasher.update(`${rule.id}:MISSING`);
        }
    }
    if (filesHashed === 0)
        return null;
    return hasher.digest('hex').slice(0, 32);
}
//# sourceMappingURL=structural-cache.js.map