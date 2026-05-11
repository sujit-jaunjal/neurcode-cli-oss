/**
 * Persistent deterministic brain cache infrastructure.
 *
 * Design principles:
 *   - Content-hash invalidation: files are only re-indexed when content changes
 *   - Replay-safe: cache manifest is deterministic and serializable
 *   - CI-restorable: manifest + index can be archived and restored across runs
 *   - Governance-neutral: cache accelerates indexing, never affects correctness
 *   - Append-only manifest entries (no silent deletion of records)
 *
 * Cache location: <projectRoot>/.neurcode/brain/cache/
 * Manifest:       <projectRoot>/.neurcode/brain/cache/manifest.json
 * Semantic index: <projectRoot>/.neurcode/brain/cache/semantic-index.json
 */
export declare const BRAIN_CACHE_SCHEMA_VERSION: "2026-05-11.1";
export interface BrainCacheFileEntry {
    /** Repo-relative file path. */
    filePath: string;
    /** SHA-256 content hash (hex). */
    contentHash: string;
    /** Last-modified timestamp (Unix ms). */
    lastModifiedMs: number;
    /** File size in bytes. */
    sizeBytes: number;
    /** True when this file was included in the semantic index. */
    indexed: boolean;
}
export interface BrainCacheManifest {
    schemaVersion: typeof BRAIN_CACHE_SCHEMA_VERSION;
    /** Repository root path at build time. */
    repoRoot: string;
    /** ISO 8601 build timestamp. */
    builtAt: string;
    /** SHA-256 of the manifest itself (for integrity checks). Populated after write. */
    manifestHash: string;
    /** Total files tracked. */
    totalFiles: number;
    /** Total files indexed in semantic index. */
    indexedFiles: number;
    /** Combined content hash of all tracked files (for CI cache key generation). */
    contentFingerprint: string;
    /** Per-file entries. */
    files: BrainCacheFileEntry[];
}
export interface BrainCacheStatus {
    exists: boolean;
    manifest: BrainCacheManifest | null;
    staleFiles: string[];
    missingFiles: string[];
    newFiles: string[];
    totalFiles: number;
    freshFiles: number;
    stalePercent: number;
    needsRebuild: boolean;
    cacheDir: string;
    manifestPath: string;
    semanticIndexPath: string;
    sizeBytes: number;
}
export declare function getBrainCacheDir(projectRoot: string): string;
export declare function getBrainCacheManifestPath(projectRoot: string): string;
export declare function getBrainCacheSemanticIndexPath(projectRoot: string): string;
export declare function hashFileContent(content: string): string;
export declare function loadBrainCacheManifest(projectRoot: string): BrainCacheManifest | null;
export declare function saveBrainCacheManifest(projectRoot: string, manifest: Omit<BrainCacheManifest, 'manifestHash'>): BrainCacheManifest;
export interface BrainCacheBuildOptions {
    projectRoot: string;
    maxFiles?: number;
    /** If true, force full rebuild ignoring existing manifest. */
    force?: boolean;
    onProgress?: (indexed: number, total: number) => void;
}
export interface BrainCacheBuildResult {
    manifest: BrainCacheManifest;
    builtFiles: number;
    skippedFiles: number;
    /** Files re-indexed because content changed. */
    updatedFiles: number;
    elapsedMs: number;
}
export declare function buildBrainCache(options: BrainCacheBuildOptions): BrainCacheBuildResult;
export declare function getBrainCacheStatus(projectRoot: string): BrainCacheStatus;
export interface BrainCacheRestoreOptions {
    projectRoot: string;
    /** Path to the CI cache artifact (JSON). */
    artifactPath: string;
}
export interface BrainCacheRestoreResult {
    success: boolean;
    manifest: BrainCacheManifest | null;
    message: string;
    staleAfterRestore: number;
}
export declare function restoreBrainCache(options: BrainCacheRestoreOptions): BrainCacheRestoreResult;
/**
 * Export the current cache manifest as a CI artifact.
 * CI pipelines can cache this file and restore it on subsequent runs.
 */
export declare function exportBrainCacheArtifact(projectRoot: string, outputPath: string): boolean;
//# sourceMappingURL=brain-cache.d.ts.map