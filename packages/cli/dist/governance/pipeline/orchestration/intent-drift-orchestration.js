"use strict";
/**
 * Intent Drift Orchestration
 * ---------------------------
 * Wraps the intent-governance module (`governance/intent/*`) into an
 * orchestration surface consumable by verify.ts. Pattern matches the other
 * orchestration modules:
 *
 *   - Caller hands us inputs (projectRoot, diffFiles, options).
 *   - We load the contract, run drift detection, return a typed result.
 *   - We do NOT render, log, or emit JSON. Caller owns presentation.
 *   - On any internal error, we return a safe empty result. Drift detection
 *     is opt-in; a malformed contract must never break verification.
 *
 * Phase 1 INVARIANT: drift detection is ADVISORY by default. The detector
 * only emits BLOCK-severity violations when `enforce: true` is passed
 * explicitly. Callers wishing to enforce must read the contract's
 * enforcement signal (a future schema field, or an environment opt-in).
 *
 * Intelligence classification: DETERMINISTIC (delegated to inner module).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIntentDriftOrchestration = runIntentDriftOrchestration;
const intent_1 = require("../../intent");
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Run the intent-drift detection orchestration. Safe to call on every verify run.
 *
 * Cost model:
 *   - No contract → ~1ms (filesystem stat + early return).
 *   - Contract present → proportional to (diff size × layer count). For a typical
 *     50-file diff against a 5-layer contract, well under 50ms.
 */
function runIntentDriftOrchestration(input) {
    let load;
    try {
        load = (0, intent_1.loadIntentContract)(input.projectRoot, input.contractPath);
    }
    catch (err) {
        // Defensive: loadIntentContract is already non-throwing, but we guard
        // against future regressions and unexpected runtime errors.
        const msg = err instanceof Error ? err.message : String(err);
        return {
            contractPresent: false,
            contractPath: input.contractPath ?? '<unresolved>',
            contractErrors: [`unexpected error loading intent contract: ${msg}`],
            contractWarnings: [],
            enforced: false,
            report: (0, intent_1.runDriftDetection)({
                graph: intent_1.EMPTY_INTENT_GRAPH,
                diffFiles: [],
            }),
        };
    }
    if (!load.exists || load.errors.length > 0) {
        return {
            contractPresent: load.exists,
            contractPath: load.path,
            contractErrors: load.errors,
            contractWarnings: load.warnings,
            enforced: false,
            report: (0, intent_1.runDriftDetection)({
                graph: intent_1.EMPTY_INTENT_GRAPH,
                diffFiles: [],
            }),
        };
    }
    const enforce = input.enforce === true;
    let report;
    try {
        report = (0, intent_1.runDriftDetection)({
            graph: load.graph,
            diffFiles: input.diffFiles,
            enforce,
        });
    }
    catch (err) {
        // Defensive: runDriftDetection is pure but we wrap to satisfy the
        // "drift detection must never break verification" guarantee.
        const msg = err instanceof Error ? err.message : String(err);
        return {
            contractPresent: true,
            contractPath: load.path,
            contractErrors: [`unexpected error running drift detection: ${msg}`],
            contractWarnings: load.warnings,
            enforced: enforce,
            report: (0, intent_1.runDriftDetection)({
                graph: intent_1.EMPTY_INTENT_GRAPH,
                diffFiles: [],
            }),
        };
    }
    return {
        contractPresent: true,
        contractPath: load.path,
        contractErrors: load.errors,
        contractWarnings: load.warnings,
        enforced: enforce,
        report,
    };
}
//# sourceMappingURL=intent-drift-orchestration.js.map