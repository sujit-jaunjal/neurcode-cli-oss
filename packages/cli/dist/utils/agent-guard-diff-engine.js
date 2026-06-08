"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentGuardDiffEngine = void 0;
const agent_guard_1 = require("./agent-guard");
function snapshotMap(files) {
    return new Map(files.map((file) => [file.path, file]));
}
function snapshotsEqual(left, right) {
    return left.digest === right.digest && left.size === right.size;
}
function normalizeRepoPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}
/**
 * Incremental guard diff state for the supervisor hot path.
 *
 * baselineMap — immutable reference snapshots from the guard artifact.
 * currentMap  — mutable view of the working tree, seeded equal to baseline.
 * changeLedger — paths whose current snapshot differs from baseline (or is absent).
 */
class AgentGuardDiffEngine {
    repoRoot;
    baselineMap;
    currentMap;
    changeLedger = new Map();
    hashPath;
    constructor(repoRoot, baselineFiles, hashPath) {
        this.repoRoot = repoRoot;
        this.baselineMap = snapshotMap(baselineFiles);
        this.currentMap = new Map(baselineFiles.map((file) => [file.path, { ...file }]));
        this.hashPath = hashPath;
    }
    static seedFromArtifact(artifact, hashPath = agent_guard_1.hashRepoFile) {
        return new AgentGuardDiffEngine(artifact.repoRoot, artifact.baseline.files, hashPath);
    }
    get baselineSize() {
        return this.baselineMap.size;
    }
    get currentSize() {
        return this.currentMap.size;
    }
    get ledgerSize() {
        return this.changeLedger.size;
    }
    /**
     * Apply chokidar-reported path updates, hash only touched paths, reconcile ledger entries.
     */
    applyPaths(changedPaths) {
        const uniquePaths = [...new Set(changedPaths.map(normalizeRepoPath).filter(Boolean))];
        for (const path of uniquePaths) {
            this.updateCurrentPath(path);
            this.reconcilePath(path);
        }
        return { pathsProcessed: uniquePaths.length, ledgerSize: this.changeLedger.size };
    }
    /**
     * Rebuild the ledger by scanning baseline ∪ current keys.
     * Used for corruption recovery when maps may be correct but ledger drifted.
     */
    fullReconcile() {
        this.changeLedger.clear();
        const paths = new Set([
            ...this.baselineMap.keys(),
            ...this.currentMap.keys(),
        ]);
        for (const path of paths) {
            this.reconcilePath(path);
        }
        return this.changeLedger.size;
    }
    getLedgerChanges() {
        return [...this.changeLedger.entries()]
            .map(([path, changeType]) => ({ path, changeType }))
            .sort((left, right) => left.path.localeCompare(right.path));
    }
    reconcilePath(path) {
        const normalized = normalizeRepoPath(path);
        if (!normalized)
            return;
        const baseline = this.baselineMap.get(normalized);
        const current = this.currentMap.get(normalized);
        if (!baseline && !current) {
            this.changeLedger.delete(normalized);
            return;
        }
        if (!baseline && current) {
            this.changeLedger.set(normalized, 'created');
            return;
        }
        if (baseline && !current) {
            this.changeLedger.set(normalized, 'deleted');
            return;
        }
        if (baseline && current && snapshotsEqual(baseline, current)) {
            this.changeLedger.delete(normalized);
            return;
        }
        this.changeLedger.set(normalized, 'modified');
    }
    updateCurrentPath(path) {
        const hashed = this.hashPath(this.repoRoot, path);
        if (hashed) {
            this.currentMap.set(path, hashed);
            return;
        }
        this.currentMap.delete(path);
    }
}
exports.AgentGuardDiffEngine = AgentGuardDiffEngine;
//# sourceMappingURL=agent-guard-diff-engine.js.map