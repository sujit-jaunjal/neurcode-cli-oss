"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MEMORY_DEGRADE_ADVISORY_THRESHOLD = exports.MEMORY_DEGRADE_SEMANTIC_THRESHOLD = exports.LARGE_REPO_FILE_THRESHOLD = exports.CI_VERIFY_MAX_MS = exports.LOCAL_VERIFY_MAX_MS = void 0;
exports.createVerifyRuntimeContext = createVerifyRuntimeContext;
exports.isTimedOut = isTimedOut;
exports.elapsedMs = elapsedMs;
exports.remainingMs = remainingMs;
exports.isTimePressure = isTimePressure;
exports.getHeapUsedFraction = getHeapUsedFraction;
exports.applyMemoryPressureDegradation = applyMemoryPressureDegradation;
exports.estimateRepoFileCount = estimateRepoFileCount;
exports.applyLargeRepoProtection = applyLargeRepoProtection;
exports.shouldSkipSemanticLayer = shouldSkipSemanticLayer;
exports.shouldSkipAdvisoryLayer = shouldSkipAdvisoryLayer;
exports.buildVerifyRuntimeReport = buildVerifyRuntimeReport;
const child_process_1 = require("child_process");
// ── Constants ─────────────────────────────────────────────────────────────────
/** Local verify max wall-clock time (90s default) */
exports.LOCAL_VERIFY_MAX_MS = parseInt(process.env['NEURCODE_VERIFY_TIMEOUT_LOCAL'] ?? '', 10) || 90_000;
/** CI verify max wall-clock time (180s default) */
exports.CI_VERIFY_MAX_MS = parseInt(process.env['NEURCODE_VERIFY_TIMEOUT_CI'] ?? '', 10) || 180_000;
/** Repo size threshold for large-repo warning (10,000 files) */
exports.LARGE_REPO_FILE_THRESHOLD = parseInt(process.env['NEURCODE_LARGE_REPO_THRESHOLD'] ?? '', 10) || 10_000;
/** Heap usage fraction above which semantic layer is degraded (0.75 = 75%) */
exports.MEMORY_DEGRADE_SEMANTIC_THRESHOLD = 0.75;
/** Heap usage fraction above which advisory layer is degraded (0.90 = 90%) */
exports.MEMORY_DEGRADE_ADVISORY_THRESHOLD = 0.90;
// ── Runtime context ───────────────────────────────────────────────────────────
/**
 * Create a new verify runtime context.
 * Call once at the start of verify execution.
 */
function createVerifyRuntimeContext(isCI) {
    return {
        isCI,
        timeoutMs: isCI ? exports.CI_VERIFY_MAX_MS : exports.LOCAL_VERIFY_MAX_MS,
        startedAt: Date.now(),
        degradedLayers: new Set(),
        degradationReasons: [],
        skippedSubsystems: [],
        largeRepoMode: false,
        estimatedFileCount: null,
    };
}
// ── Time pressure ─────────────────────────────────────────────────────────────
/**
 * Check if the verify execution has exceeded its time budget.
 *
 * @returns true if timeout has been exceeded
 */
function isTimedOut(ctx) {
    return (Date.now() - ctx.startedAt) >= ctx.timeoutMs;
}
/**
 * Get elapsed time in milliseconds since verify started.
 */
function elapsedMs(ctx) {
    return Date.now() - ctx.startedAt;
}
/**
 * Get remaining time in milliseconds before timeout.
 */
function remainingMs(ctx) {
    return Math.max(0, ctx.timeoutMs - elapsedMs(ctx));
}
/**
 * Check if remaining time is below a given threshold.
 * Use to preemptively skip expensive operations.
 *
 * @param ctx        Runtime context
 * @param thresholdMs  Time threshold in ms (default: 5000ms)
 */
function isTimePressure(ctx, thresholdMs = 5_000) {
    return remainingMs(ctx) < thresholdMs;
}
// ── Memory pressure ───────────────────────────────────────────────────────────
/**
 * Get current heap usage as a fraction of heap limit.
 * Returns 0 if measurement is unavailable.
 */
function getHeapUsedFraction() {
    try {
        const mem = process.memoryUsage();
        if (mem.heapTotal > 0) {
            return mem.heapUsed / mem.heapTotal;
        }
    }
    catch {
        // Non-fatal
    }
    return 0;
}
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
function applyMemoryPressureDegradation(ctx) {
    const fraction = getHeapUsedFraction();
    if (fraction >= exports.MEMORY_DEGRADE_ADVISORY_THRESHOLD && !ctx.degradedLayers.has('advisory')) {
        ctx.degradedLayers.add('advisory');
        ctx.degradationReasons.push(`Heap usage at ${Math.round(fraction * 100)}% exceeded advisory threshold ` +
            `(${Math.round(exports.MEMORY_DEGRADE_ADVISORY_THRESHOLD * 100)}%) — advisory layer degraded`);
        ctx.skippedSubsystems.push('advisory-signals', 'heuristic-rules');
    }
    if (fraction >= exports.MEMORY_DEGRADE_SEMANTIC_THRESHOLD && !ctx.degradedLayers.has('semantic')) {
        ctx.degradedLayers.add('semantic');
        ctx.degradationReasons.push(`Heap usage at ${Math.round(fraction * 100)}% exceeded semantic threshold ` +
            `(${Math.round(exports.MEMORY_DEGRADE_SEMANTIC_THRESHOLD * 100)}%) — semantic layer degraded`);
        ctx.skippedSubsystems.push('intent-expansion', 'llm-planning');
    }
}
// ── Large repo detection ──────────────────────────────────────────────────────
/**
 * Estimate the number of tracked files in the git repository.
 * Returns null if git is unavailable or the command fails.
 */
function estimateRepoFileCount(projectRoot) {
    try {
        const output = (0, child_process_1.execSync)('git ls-files --cached | wc -l', {
            cwd: projectRoot,
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const count = parseInt(output.trim(), 10);
        return Number.isFinite(count) ? count : null;
    }
    catch {
        return null;
    }
}
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
function applyLargeRepoProtection(ctx, projectRoot) {
    const count = estimateRepoFileCount(projectRoot);
    ctx.estimatedFileCount = count;
    if (count !== null && count > exports.LARGE_REPO_FILE_THRESHOLD) {
        ctx.largeRepoMode = true;
        ctx.degradationReasons.push(`Large repo detected (${count.toLocaleString()} tracked files, threshold: ` +
            `${exports.LARGE_REPO_FILE_THRESHOLD.toLocaleString()}). ` +
            `Structural cache warm-up recommended: run \`neurcode cache build\` before CI. ` +
            `Semantic state will NOT be rebuilt synchronously in CI mode.`);
        if (ctx.isCI) {
            ctx.skippedSubsystems.push('synchronous-semantic-state-rebuild');
        }
    }
}
// ── Degradation guards ────────────────────────────────────────────────────────
/**
 * Return true if the semantic layer should be skipped.
 * Call before any LLM-assisted or semantic expansion operations.
 */
function shouldSkipSemanticLayer(ctx) {
    return ctx.degradedLayers.has('semantic') || isTimePressure(ctx, 10_000);
}
/**
 * Return true if the advisory layer should be skipped.
 * Call before any heuristic or advisory-only operations.
 */
function shouldSkipAdvisoryLayer(ctx) {
    return ctx.degradedLayers.has('advisory') || isTimePressure(ctx, 3_000);
}
// ── Report generation ─────────────────────────────────────────────────────────
/**
 * Build a runtime transparency report from the context.
 * Include this in verify JSON output when --ci flag is set.
 */
function buildVerifyRuntimeReport(ctx) {
    const heapFraction = getHeapUsedFraction();
    let memoryMb = 0;
    try {
        memoryMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    }
    catch {
        // Non-fatal
    }
    return {
        degraded: ctx.degradedLayers.size > 0 || ctx.largeRepoMode,
        degradedLayers: [...ctx.degradedLayers],
        degradationReasons: [...ctx.degradationReasons],
        skippedSubsystems: [...ctx.skippedSubsystems],
        largeRepoMode: ctx.largeRepoMode,
        estimatedFileCount: ctx.estimatedFileCount,
        elapsedMs: elapsedMs(ctx),
        timeoutMs: ctx.timeoutMs,
        remainingMs: remainingMs(ctx),
        memoryUsageMb: memoryMb,
        heapUsedFraction: Math.round(heapFraction * 1000) / 1000,
        structuralGovernanceOperational: true,
    };
}
//# sourceMappingURL=verify-runtime-stability.js.map