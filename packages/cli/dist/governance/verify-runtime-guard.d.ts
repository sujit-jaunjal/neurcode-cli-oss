/**
 * Verify Runtime Guard (Phase 5 — CI Stability Hardening)
 *
 * Provides:
 * 1. withVerifyTimeout() — wraps any verify sub-step with a wall-clock timeout.
 *    On timeout: returns a degraded result instead of hanging indefinitely.
 *    This ensures CI jobs always terminate, even when a rule engine or
 *    brain indexer stalls on an unexpectedly large file.
 *
 * 2. buildCIHealthSummary() — produces a structured CI health summary with:
 *    - cache warm/cold indicator
 *    - per-subsystem latency breakdown
 *    - degraded subsystem list
 *    Used for CI visibility when --ci flag is set.
 *
 * Key design invariant:
 *   withVerifyTimeout NEVER throws. It returns a typed DegradedResult.
 *   Callers must check result.degraded before using result.value.
 */
export interface DegradedResult<T> {
    degraded: false;
    value: T;
    durationMs: number;
}
export interface TimeoutResult {
    degraded: true;
    reason: 'timeout';
    timeoutMs: number;
    durationMs: number;
}
export interface ErrorResult {
    degraded: true;
    reason: 'error';
    error: string;
    durationMs: number;
}
export type SubstepResult<T> = DegradedResult<T> | TimeoutResult | ErrorResult;
export interface CISubsystemTiming {
    name: string;
    durationMs: number;
    status: 'ok' | 'degraded' | 'timeout' | 'error' | 'skipped';
}
export interface CIHealthSummary {
    /** Was the structural cache warm (hits > 0) or cold? */
    cacheStatus: 'warm' | 'cold' | 'disabled';
    /** Total wall-clock time across all subsystems */
    totalDurationMs: number;
    /** Per-subsystem timing breakdown */
    subsystems: CISubsystemTiming[];
    /** Names of subsystems that ran in degraded mode */
    degradedSubsystems: string[];
    /** Whether all subsystems completed successfully */
    allSubsystemsHealthy: boolean;
    /** ISO timestamp */
    generatedAt: string;
}
/**
 * Run an async function with a wall-clock timeout.
 *
 * On success: returns { degraded: false, value: T, durationMs }
 * On timeout: returns { degraded: true, reason: 'timeout', timeoutMs, durationMs }
 * On error:   returns { degraded: true, reason: 'error', error: string, durationMs }
 *
 * NEVER throws. All error/timeout paths are handled internally.
 *
 * @param fn         The async function to execute
 * @param timeoutMs  Wall-clock timeout in milliseconds
 */
export declare function withVerifyTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<SubstepResult<T>>;
/**
 * Synchronous version of withVerifyTimeout for use with non-async functions.
 *
 * Since true synchronous timeout is impossible in Node.js without worker threads,
 * this wraps the synchronous function as a Promise and applies the async timeout.
 * If the sync function blocks the event loop longer than timeoutMs, the timeout
 * will fire only after it completes — this is a best-effort guard for functions
 * that are expected to complete quickly but may unexpectedly stall.
 */
export declare function withVerifyTimeoutSync<T>(fn: () => T, timeoutMs: number): Promise<SubstepResult<T>>;
export interface CIHealthInput {
    subsystems: CISubsystemTiming[];
    cacheHits: number;
    cacheEnabled: boolean;
}
/**
 * Build a structured CI health summary from subsystem timing data.
 *
 * @param input  Subsystem timings collected during verify execution
 */
export declare function buildCIHealthSummary(input: CIHealthInput): CIHealthSummary;
/** Default timeout for the structural rule engine per verify run (30s) */
export declare const STRUCTURAL_ENGINE_TIMEOUT_MS = 30000;
/** Default timeout for the brain context indexer (20s) */
export declare const BRAIN_INDEXER_TIMEOUT_MS = 20000;
/** Default timeout for intent engine operations (25s) */
export declare const INTENT_ENGINE_TIMEOUT_MS = 25000;
/** Maximum total verify wall-clock time before CI is considered hung (5min) */
export declare const VERIFY_TOTAL_TIMEOUT_MS = 300000;
//# sourceMappingURL=verify-runtime-guard.d.ts.map