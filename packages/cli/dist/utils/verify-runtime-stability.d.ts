/**
 * Verify Runtime Stability (Phase 4 — Verify Runtime Stability)
 *
 * Bounded execution guarantees for enterprise CI environments.
 *
 * Provides:
 * 1. Hard execution timeouts with graceful partial-result preservation
 * 2. Large repo detection and cache-build recommendations
 * 3. Memory pressure tracking with layered degradation
 * 4. Runtime transparency — every degraded mode is explicitly reported
 *
 * Layered degradation order (when memory or time pressure is detected):
 *   1. Semantic layer first (LLM-assisted planning, intent expansion)
 *   2. Advisory systems second (heuristic signals, advisory-only rules)
 *   3. NEVER structural governance — AST-backed structural verification
 *      MUST remain operational even under full degradation
 *
 * Design constraints:
 *   - All timeouts are configurable via environment variables
 *   - Degradation is explicit and reported in verify output
 *   - Partial findings are always preserved (never silently dropped)
 *   - Structural governance is protected by construction
 */
/** Local verify max wall-clock time (90s default) */
export declare const LOCAL_VERIFY_MAX_MS: number;
/** CI verify max wall-clock time (180s default) */
export declare const CI_VERIFY_MAX_MS: number;
/** Repo size threshold for large-repo warning (10,000 files) */
export declare const LARGE_REPO_FILE_THRESHOLD: number;
/** Heap usage fraction above which semantic layer is degraded (0.75 = 75%) */
export declare const MEMORY_DEGRADE_SEMANTIC_THRESHOLD = 0.75;
/** Heap usage fraction above which advisory layer is degraded (0.90 = 90%) */
export declare const MEMORY_DEGRADE_ADVISORY_THRESHOLD = 0.9;
export type DegradedLayer = 'semantic' | 'advisory';
export interface VerifyRuntimeContext {
    /** Whether running in CI mode */
    isCI: boolean;
    /** Effective timeout in milliseconds */
    timeoutMs: number;
    /** Timestamp when verify started */
    startedAt: number;
    /** Set of layers that have been degraded */
    degradedLayers: Set<DegradedLayer>;
    /** Degradation reasons */
    degradationReasons: string[];
    /** Skipped subsystems due to degradation */
    skippedSubsystems: string[];
    /** Whether large-repo mode was triggered */
    largeRepoMode: boolean;
    /** Estimated file count (if detectable) */
    estimatedFileCount: number | null;
}
export interface VerifyRuntimeReport {
    degraded: boolean;
    degradedLayers: DegradedLayer[];
    degradationReasons: string[];
    skippedSubsystems: string[];
    largeRepoMode: boolean;
    estimatedFileCount: number | null;
    elapsedMs: number;
    timeoutMs: number;
    remainingMs: number;
    memoryUsageMb: number;
    heapUsedFraction: number;
    structuralGovernanceOperational: true;
}
/**
 * Create a new verify runtime context.
 * Call once at the start of verify execution.
 */
export declare function createVerifyRuntimeContext(isCI: boolean): VerifyRuntimeContext;
/**
 * Check if the verify execution has exceeded its time budget.
 *
 * @returns true if timeout has been exceeded
 */
export declare function isTimedOut(ctx: VerifyRuntimeContext): boolean;
/**
 * Get elapsed time in milliseconds since verify started.
 */
export declare function elapsedMs(ctx: VerifyRuntimeContext): number;
/**
 * Get remaining time in milliseconds before timeout.
 */
export declare function remainingMs(ctx: VerifyRuntimeContext): number;
/**
 * Check if remaining time is below a given threshold.
 * Use to preemptively skip expensive operations.
 *
 * @param ctx        Runtime context
 * @param thresholdMs  Time threshold in ms (default: 5000ms)
 */
export declare function isTimePressure(ctx: VerifyRuntimeContext, thresholdMs?: number): boolean;
/**
 * Get current heap usage as a fraction of heap limit.
 * Returns 0 if measurement is unavailable.
 */
export declare function getHeapUsedFraction(): number;
/**
 * Check memory pressure and apply layered degradation if needed.
 *
 * Degradation order:
 *   1. 75% heap: degrade semantic layer (LLM intent expansion etc.)
 *   2. 90% heap: degrade advisory layer (heuristic signals etc.)
 *   Structural governance is NEVER degraded by memory pressure.
 *
 * @param ctx  Runtime context (mutated to record degradation)
 */
export declare function applyMemoryPressureDegradation(ctx: VerifyRuntimeContext): void;
/**
 * Estimate the number of tracked files in the git repository.
 * Returns null if git is unavailable or the command fails.
 */
export declare function estimateRepoFileCount(projectRoot: string): number | null;
/**
 * Check if the repo qualifies as a large repo and apply appropriate guidance.
 *
 * If file count exceeds LARGE_REPO_FILE_THRESHOLD:
 *   - Sets ctx.largeRepoMode = true
 *   - Adds a cache-build recommendation to degradationReasons
 *   - Does NOT degrade structural governance
 *
 * @param ctx          Runtime context (mutated)
 * @param projectRoot  Project root path
 */
export declare function applyLargeRepoProtection(ctx: VerifyRuntimeContext, projectRoot: string): void;
/**
 * Return true if the semantic layer should be skipped.
 * Call before any LLM-assisted or semantic expansion operations.
 */
export declare function shouldSkipSemanticLayer(ctx: VerifyRuntimeContext): boolean;
/**
 * Return true if the advisory layer should be skipped.
 * Call before any heuristic or advisory-only operations.
 */
export declare function shouldSkipAdvisoryLayer(ctx: VerifyRuntimeContext): boolean;
/**
 * Build a runtime transparency report from the context.
 * Include this in verify JSON output when --ci flag is set.
 */
export declare function buildVerifyRuntimeReport(ctx: VerifyRuntimeContext): VerifyRuntimeReport;
//# sourceMappingURL=verify-runtime-stability.d.ts.map