"use strict";
/**
 * Intent Graph — typed model for architectural intent.
 *
 * The Intent Graph is the foundational data structure for Intent-Aware Governance
 * Intelligence. It represents the *intended* architecture of a codebase as a
 * declarative, machine-verifiable artifact, distinct from:
 *
 *   - Plan contracts (`expectedFiles`)        — per-change file expectations
 *   - Change contracts                        — diff-vs-plan enforcement
 *   - Intent engine (`runIntentEngine`)       — NL prompt → code coverage matcher
 *   - Structural rules                        — code-pattern violations (SR001 ...)
 *
 * What the Intent Graph adds: a stable, declarative model of *which parts of the
 * codebase are allowed to depend on which other parts*. Layers, modules, trust
 * boundaries, and directional dependency rules are first-class nodes/edges.
 *
 * Phase 1 scope (this file):
 *   - Typed primitives only.
 *   - No runtime computation, no I/O, no validation.
 *   - Used as the shared vocabulary across intent-contract.ts (loading),
 *     drift-detector.ts (analysis), and verify.ts (reporting).
 *
 * Intelligence classification: DETERMINISTIC (pure types).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMPTY_INTENT_GRAPH = exports.INTENT_GRAPH_SCHEMA_VERSION = void 0;
exports.isEmptyIntentGraph = isEmptyIntentGraph;
exports.intentGraphHasEnforcement = intentGraphHasEnforcement;
// ── Schema version ───────────────────────────────────────────────────────────
/** Current schema version. Bumped only with a breaking-change migration plan. */
exports.INTENT_GRAPH_SCHEMA_VERSION = 1;
// ── Empty graph ──────────────────────────────────────────────────────────────
/**
 * A canonical empty graph. Used when no intent contract is configured — drift
 * detection short-circuits to "no violations" deterministically.
 */
exports.EMPTY_INTENT_GRAPH = Object.freeze({
    schemaVersion: exports.INTENT_GRAPH_SCHEMA_VERSION,
    layers: [],
    modules: [],
    trustBoundaries: [],
    allowedEdges: [],
    forbiddenEdges: [],
    fingerprint: 'empty:0',
});
// ── Predicates ───────────────────────────────────────────────────────────────
/**
 * Return true when the graph defines *no* layers/modules/boundaries/edges.
 * Drift detection skips entirely when this is true.
 */
function isEmptyIntentGraph(graph) {
    return (graph.layers.length === 0 &&
        graph.modules.length === 0 &&
        graph.trustBoundaries.length === 0 &&
        graph.allowedEdges.length === 0 &&
        graph.forbiddenEdges.length === 0);
}
/**
 * Returns true if the graph has at least one rule that can produce a drift
 * finding. A graph with only layers but no edges is "in observation mode" —
 * it can classify files but not flag violations.
 */
function intentGraphHasEnforcement(graph) {
    return graph.allowedEdges.length > 0 || graph.forbiddenEdges.length > 0;
}
//# sourceMappingURL=intent-graph.js.map