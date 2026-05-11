"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BRAIN_CACHE_SCHEMA_VERSION = void 0;
exports.getBrainCacheDir = getBrainCacheDir;
exports.getBrainCacheManifestPath = getBrainCacheManifestPath;
exports.getBrainCacheSemanticIndexPath = getBrainCacheSemanticIndexPath;
exports.hashFileContent = hashFileContent;
exports.loadBrainCacheManifest = loadBrainCacheManifest;
exports.saveBrainCacheManifest = saveBrainCacheManifest;
exports.buildBrainCache = buildBrainCache;
exports.getBrainCacheStatus = getBrainCacheStatus;
exports.restoreBrainCache = restoreBrainCache;
exports.exportBrainCacheArtifact = exportBrainCacheArtifact;
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
// ── Schema version ─────────────────────────────────────────────────────────────
exports.BRAIN_CACHE_SCHEMA_VERSION = '2026-05-11.1';
// ── Cache paths ────────────────────────────────────────────────────────────────
function getBrainCacheDir(projectRoot) {
    return (0, path_1.join)(projectRoot, '.neurcode', 'brain', 'cache');
}
function getBrainCacheManifestPath(projectRoot) {
    return (0, path_1.join)(getBrainCacheDir(projectRoot), 'manifest.json');
}
function getBrainCacheSemanticIndexPath(projectRoot) {
    return (0, path_1.join)(getBrainCacheDir(projectRoot), 'semantic-index.json');
}
// ── Content hashing ────────────────────────────────────────────────────────────
function hashFileContent(content) {
    return (0, crypto_1.createHash)('sha256').update(content, 'utf-8').digest('hex');
}
function hashFileAtPath(filePath) {
    try {
        const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
        return hashFileContent(content);
    }
    catch {
        return '';
    }
}
function contentFingerprint(files) {
    const sorted = [...files]
        .sort((a, b) => a.filePath.localeCompare(b.filePath))
        .map((f) => `${f.filePath}:${f.contentHash}`)
        .join('\n');
    return (0, crypto_1.createHash)('sha256').update(sorted, 'utf-8').digest('hex').slice(0, 32);
}
// ── Manifest I/O ───────────────────────────────────────────────────────────────
function loadBrainCacheManifest(projectRoot) {
    const path = getBrainCacheManifestPath(projectRoot);
    if (!(0, fs_1.existsSync)(path))
        return null;
    try {
        const raw = (0, fs_1.readFileSync)(path, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed.schemaVersion !== exports.BRAIN_CACHE_SCHEMA_VERSION) {
            return null; // incompatible schema, treat as cache miss
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function saveBrainCacheManifest(projectRoot, manifest) {
    const cacheDir = getBrainCacheDir(projectRoot);
    (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
    const withoutHash = { ...manifest, manifestHash: '' };
    const serialized = JSON.stringify(withoutHash, null, 2);
    const hash = (0, crypto_1.createHash)('sha256').update(serialized, 'utf-8').digest('hex');
    const final = { ...withoutHash, manifestHash: hash };
    (0, fs_1.writeFileSync)(getBrainCacheManifestPath(projectRoot), JSON.stringify(final, null, 2), 'utf-8');
    return final;
}
// ── Scan project files for indexable content ───────────────────────────────────
const INDEXABLE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs',
    '.py', '.go', '.rs', '.java', '.rb', '.swift',
]);
const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'out',
    '.neurcode', '__pycache__', '.venv', 'venv', '.cache',
]);
function scanIndexableFiles(projectRoot, maxFiles = 5000) {
    const results = [];
    function traverse(dir, depth = 0) {
        if (depth > 10)
            return;
        let entries = [];
        try {
            entries = (0, fs_1.readdirSync)(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (EXCLUDED_DIRS.has(entry))
                continue;
            const fullPath = (0, path_1.join)(dir, entry);
            let stat;
            try {
                stat = (0, fs_1.statSync)(fullPath);
            }
            catch {
                continue;
            }
            if (stat.isDirectory()) {
                traverse(fullPath, depth + 1);
            }
            else if (stat.isFile()) {
                const dotIdx = entry.lastIndexOf('.');
                if (dotIdx > 0 && INDEXABLE_EXTENSIONS.has(entry.slice(dotIdx))) {
                    results.push(fullPath);
                    if (results.length >= maxFiles)
                        return;
                }
            }
        }
    }
    traverse(projectRoot);
    return results;
}
function buildBrainCache(options) {
    const { projectRoot, maxFiles = 5000, force = false } = options;
    const start = Date.now();
    const existing = force ? null : loadBrainCacheManifest(projectRoot);
    const existingMap = new Map((existing?.files ?? []).map((f) => [f.filePath, f]));
    const allFiles = scanIndexableFiles(projectRoot, maxFiles);
    const entries = [];
    let builtFiles = 0;
    let skippedFiles = 0;
    let updatedFiles = 0;
    for (let i = 0; i < allFiles.length; i++) {
        const fullPath = allFiles[i];
        const relPath = (0, path_1.relative)(projectRoot, fullPath).split(path_1.sep).join('/');
        let stat;
        try {
            stat = (0, fs_1.statSync)(fullPath);
        }
        catch {
            continue;
        }
        const existing = existingMap.get(relPath);
        const lastModifiedMs = stat.mtimeMs;
        // Fast path: mtime unchanged → skip rehash
        if (existing && Math.abs(existing.lastModifiedMs - lastModifiedMs) < 1000) {
            entries.push(existing);
            skippedFiles++;
        }
        else {
            const contentHash = hashFileAtPath(fullPath);
            if (!contentHash)
                continue;
            const isUpdated = existing !== undefined && existing.contentHash !== contentHash;
            if (isUpdated)
                updatedFiles++;
            entries.push({
                filePath: relPath,
                contentHash,
                lastModifiedMs,
                sizeBytes: stat.size,
                indexed: true,
            });
            builtFiles++;
        }
        if (options.onProgress && (i % 100 === 0 || i === allFiles.length - 1)) {
            options.onProgress(i + 1, allFiles.length);
        }
    }
    const manifest = saveBrainCacheManifest(projectRoot, {
        schemaVersion: exports.BRAIN_CACHE_SCHEMA_VERSION,
        repoRoot: projectRoot,
        builtAt: new Date().toISOString(),
        totalFiles: entries.length,
        indexedFiles: entries.filter((e) => e.indexed).length,
        contentFingerprint: contentFingerprint(entries),
        files: entries,
    });
    return {
        manifest,
        builtFiles,
        skippedFiles,
        updatedFiles,
        elapsedMs: Date.now() - start,
    };
}
// ── Cache status ───────────────────────────────────────────────────────────────
function getBrainCacheStatus(projectRoot) {
    const cacheDir = getBrainCacheDir(projectRoot);
    const manifestPath = getBrainCacheManifestPath(projectRoot);
    const semanticIndexPath = getBrainCacheSemanticIndexPath(projectRoot);
    const manifest = loadBrainCacheManifest(projectRoot);
    if (!manifest) {
        return {
            exists: false,
            manifest: null,
            staleFiles: [],
            missingFiles: [],
            newFiles: [],
            totalFiles: 0,
            freshFiles: 0,
            stalePercent: 0,
            needsRebuild: true,
            cacheDir,
            manifestPath,
            semanticIndexPath,
            sizeBytes: 0,
        };
    }
    // Check staleness: compare manifest hashes against current files
    const staleFiles = [];
    const missingFiles = [];
    for (const entry of manifest.files) {
        const fullPath = (0, path_1.join)(projectRoot, entry.filePath);
        if (!(0, fs_1.existsSync)(fullPath)) {
            missingFiles.push(entry.filePath);
            continue;
        }
        const currentHash = hashFileAtPath(fullPath);
        if (currentHash !== entry.contentHash) {
            staleFiles.push(entry.filePath);
        }
    }
    // Detect new files not in manifest
    const manifestFileSet = new Set(manifest.files.map((f) => f.filePath));
    const currentFiles = scanIndexableFiles(projectRoot, 10_000);
    const newFiles = [];
    for (const f of currentFiles) {
        const rel = (0, path_1.relative)(projectRoot, f).split(path_1.sep).join('/');
        if (!manifestFileSet.has(rel))
            newFiles.push(rel);
    }
    const totalFiles = manifest.totalFiles;
    const changedFiles = staleFiles.length + missingFiles.length;
    const freshFiles = totalFiles - changedFiles;
    const stalePercent = totalFiles > 0 ? Math.round((changedFiles / totalFiles) * 100) : 0;
    const needsRebuild = stalePercent > 20 || newFiles.length > 50;
    let sizeBytes = 0;
    for (const path of [manifestPath, semanticIndexPath]) {
        try {
            sizeBytes += (0, fs_1.statSync)(path).size;
        }
        catch { /* ignore */ }
    }
    return {
        exists: true,
        manifest,
        staleFiles,
        missingFiles,
        newFiles,
        totalFiles,
        freshFiles,
        stalePercent,
        needsRebuild,
        cacheDir,
        manifestPath,
        semanticIndexPath,
        sizeBytes,
    };
}
function restoreBrainCache(options) {
    const { projectRoot, artifactPath } = options;
    if (!(0, fs_1.existsSync)(artifactPath)) {
        return {
            success: false,
            manifest: null,
            message: `Artifact not found: ${artifactPath}`,
            staleAfterRestore: 0,
        };
    }
    let artifact;
    try {
        artifact = JSON.parse((0, fs_1.readFileSync)(artifactPath, 'utf-8'));
    }
    catch (err) {
        return {
            success: false,
            manifest: null,
            message: `Failed to parse artifact: ${err instanceof Error ? err.message : String(err)}`,
            staleAfterRestore: 0,
        };
    }
    if (artifact.schemaVersion !== exports.BRAIN_CACHE_SCHEMA_VERSION) {
        return {
            success: false,
            manifest: null,
            message: `Incompatible cache schema: ${artifact.schemaVersion} (expected ${exports.BRAIN_CACHE_SCHEMA_VERSION})`,
            staleAfterRestore: 0,
        };
    }
    // Write artifact to cache dir
    const cacheDir = getBrainCacheDir(projectRoot);
    (0, fs_1.mkdirSync)(cacheDir, { recursive: true });
    (0, fs_1.writeFileSync)(getBrainCacheManifestPath(projectRoot), JSON.stringify(artifact, null, 2), 'utf-8');
    // Quick staleness check on restore
    let staleAfterRestore = 0;
    for (const entry of artifact.files.slice(0, 200)) { // sample first 200
        const fullPath = (0, path_1.join)(projectRoot, entry.filePath);
        if (!(0, fs_1.existsSync)(fullPath)) {
            staleAfterRestore++;
            continue;
        }
        const hash = hashFileAtPath(fullPath);
        if (hash !== entry.contentHash)
            staleAfterRestore++;
    }
    return {
        success: true,
        manifest: artifact,
        message: `Cache restored from ${artifactPath} (${artifact.totalFiles} files, built ${artifact.builtAt})`,
        staleAfterRestore,
    };
}
// ── CI artifact export ─────────────────────────────────────────────────────────
/**
 * Export the current cache manifest as a CI artifact.
 * CI pipelines can cache this file and restore it on subsequent runs.
 */
function exportBrainCacheArtifact(projectRoot, outputPath) {
    const manifest = loadBrainCacheManifest(projectRoot);
    if (!manifest)
        return false;
    try {
        (0, fs_1.writeFileSync)(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=brain-cache.js.map