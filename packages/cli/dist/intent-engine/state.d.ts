/**
 * Intent State — lightweight persistence layer for the regression engine.
 *
 * Reads/writes a single JSON file at .neurcode/intent-state.json.
 * All functions are safe: they never throw and never crash verification.
 */
export interface IntentStateSummary {
    domain: string;
    coverage: number;
    weightedCoverage: number;
    status: string;
    criticalMissing: string[];
}
export interface IntentState {
    intent: string;
    timestamp: string;
    intentSummary: IntentStateSummary | null;
    /** Flow rule IDs that were active in the previous run. */
    flowIssueIds: string[];
    /** Component key → file paths where the component was detected. */
    componentMap: Record<string, string[]>;
}
/**
 * Load the saved intent state from the previous verify run.
 * Returns null if the file is absent, unreadable, or has an invalid schema.
 */
export declare function loadPreviousState(projectRoot: string): IntentState | null;
/**
 * Persist the current intent engine state so the next verify run can detect
 * regressions.  Silently no-ops if any I/O error occurs.
 */
export declare function saveCurrentState(projectRoot: string, state: IntentState): void;
/**
 * Build an IntentState from the current engine run results.
 * Called just before saveCurrentState.
 */
export declare function buildCurrentState(intentText: string, intentSummary: {
    domain: string;
    coverage: number;
    weightedCoverage?: number;
    status?: string;
    criticalMissing?: string[];
} | null, flowIssueIds: string[], componentMap: Record<string, string[]>): IntentState;
//# sourceMappingURL=state.d.ts.map