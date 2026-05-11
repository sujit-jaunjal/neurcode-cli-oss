"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERIFY_TOTAL_TIMEOUT_MS = exports.INTENT_ENGINE_TIMEOUT_MS = exports.BRAIN_INDEXER_TIMEOUT_MS = exports.STRUCTURAL_ENGINE_TIMEOUT_MS = void 0;
exports.withVerifyTimeout = withVerifyTimeout;
exports.withVerifyTimeoutSync = withVerifyTimeoutSync;
exports.buildCIHealthSummary = buildCIHealthSummary;
// ── withVerifyTimeout ─────────────────────────────────────────────────────────
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
async function withVerifyTimeout(fn, timeoutMs) {
    const startMs = Date.now();
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                resolve({
                    degraded: true,
                    reason: 'timeout',
                    timeoutMs,
                    durationMs: Date.now() - startMs,
                });
            }
        }, timeoutMs);
        fn().then((value) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({
                    degraded: false,
                    value,
                    durationMs: Date.now() - startMs,
                });
            }
        }, (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve({
                    degraded: true,
                    reason: 'error',
                    error: err instanceof Error ? err.message : String(err),
                    durationMs: Date.now() - startMs,
                });
            }
        });
    });
}
/**
 * Synchronous version of withVerifyTimeout for use with non-async functions.
 *
 * Since true synchronous timeout is impossible in Node.js without worker threads,
 * this wraps the synchronous function as a Promise and applies the async timeout.
 * If the sync function blocks the event loop longer than timeoutMs, the timeout
 * will fire only after it completes — this is a best-effort guard for functions
 * that are expected to complete quickly but may unexpectedly stall.
 */
async function withVerifyTimeoutSync(fn, timeoutMs) {
    return withVerifyTimeout(() => Promise.resolve(fn()), timeoutMs);
}
/**
 * Build a structured CI health summary from subsystem timing data.
 *
 * @param input  Subsystem timings collected during verify execution
 */
function buildCIHealthSummary(input) {
    const totalDurationMs = input.subsystems.reduce((s, sub) => s + sub.durationMs, 0);
    const degradedSubsystems = input.subsystems
        .filter(s => s.status === 'degraded' || s.status === 'timeout' || s.status === 'error')
        .map(s => s.name);
    const allSubsystemsHealthy = degradedSubsystems.length === 0;
    let cacheStatus;
    if (!input.cacheEnabled) {
        cacheStatus = 'disabled';
    }
    else if (input.cacheHits > 0) {
        cacheStatus = 'warm';
    }
    else {
        cacheStatus = 'cold';
    }
    return {
        cacheStatus,
        totalDurationMs,
        subsystems: input.subsystems,
        degradedSubsystems,
        allSubsystemsHealthy,
        generatedAt: new Date().toISOString(),
    };
}
// ── Default timeout constants ─────────────────────────────────────────────────
/** Default timeout for the structural rule engine per verify run (30s) */
exports.STRUCTURAL_ENGINE_TIMEOUT_MS = 30_000;
/** Default timeout for the brain context indexer (20s) */
exports.BRAIN_INDEXER_TIMEOUT_MS = 20_000;
/** Default timeout for intent engine operations (25s) */
exports.INTENT_ENGINE_TIMEOUT_MS = 25_000;
/** Maximum total verify wall-clock time before CI is considered hung (5min) */
exports.VERIFY_TOTAL_TIMEOUT_MS = 300_000;
//# sourceMappingURL=verify-runtime-guard.js.map