import type { AgentGuardArtifact, AgentGuardChangeType, AgentGuardFileSnapshot } from './agent-guard';
export interface AgentGuardPathChange {
    path: string;
    changeType: AgentGuardChangeType;
}
export type AgentGuardPathHasher = (repoRoot: string, repoRelativePath: string) => AgentGuardFileSnapshot | null;
/**
 * Incremental guard diff state for the supervisor hot path.
 *
 * baselineMap — immutable reference snapshots from the guard artifact.
 * currentMap  — mutable view of the working tree, seeded equal to baseline.
 * changeLedger — paths whose current snapshot differs from baseline (or is absent).
 */
export declare class AgentGuardDiffEngine {
    private readonly repoRoot;
    private readonly baselineMap;
    private currentMap;
    private readonly changeLedger;
    private readonly hashPath;
    private constructor();
    static seedFromArtifact(artifact: AgentGuardArtifact, hashPath?: AgentGuardPathHasher): AgentGuardDiffEngine;
    get baselineSize(): number;
    get currentSize(): number;
    get ledgerSize(): number;
    /**
     * Apply chokidar-reported path updates, hash only touched paths, reconcile ledger entries.
     */
    applyPaths(changedPaths: string[]): {
        pathsProcessed: number;
        ledgerSize: number;
    };
    /**
     * Rebuild the ledger by scanning baseline ∪ current keys.
     * Used for corruption recovery when maps may be correct but ledger drifted.
     */
    fullReconcile(): number;
    getLedgerChanges(): AgentGuardPathChange[];
    reconcilePath(path: string): void;
    private updateCurrentPath;
}
//# sourceMappingURL=agent-guard-diff-engine.d.ts.map