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
/** Current schema version. Bumped only with a breaking-change migration plan. */
export declare const INTENT_GRAPH_SCHEMA_VERSION: 1;
/**
 * A named architectural layer. Layers are the primary organising concept:
 * "controller", "service", "persistence", "infrastructure", etc.
 *
 * Layer membership is determined by `glob` patterns matched against
 * project-relative file paths. Order across the contract's `layers` array
 * matters: when a file matches multiple layers, the first wins. This makes
 * the classification deterministic and human-debuggable.
 */
export interface IntentLayer {
    /** Stable identifier referenced by edges. Lowercase, snake_case recommended. */
    id: string;
    /** Optional human description shown in drift reports. */
    description?: string;
    /**
     * Glob patterns matched against project-relative paths.
     * Syntax: `**`, `*`, `?` (see glob-match.ts).
     */
    glob: string[];
}
/**
 * A logical module (a bounded subsystem). Modules cut orthogonally to layers:
 * a "billing" module may span controller, service, and persistence layers.
 *
 * Optional `entryGlob` declares the public surface — files outside the module
 * may only reach the module by importing from one of these entry files.
 * (Enforcement of the entry rule is opt-in via the contract `enforceModuleEntries`.)
 */
export interface IntentModule {
    id: string;
    description?: string;
    glob: string[];
    /** When set, only these files may be imported from outside the module. */
    entryGlob?: string[];
}
/**
 * A trust boundary describes a *directional flow rule* across a security
 * or organisational seam (e.g. tenant isolation, encryption zone, third-party
 * API surface).
 *
 * Phase 1: trust boundary detection emits ADVISORY findings only. Promotion to
 * blocking requires explicit per-boundary opt-in via a future schema field.
 */
export interface IntentTrustBoundary {
    id: string;
    description: string;
    /** Files considered "inside" the boundary. */
    insideGlob: string[];
    /**
     * Flow rule:
     *   - `inbound_only`     — external code may call in; internal code must not call out.
     *   - `outbound_only`    — internal code may call out; external code must not call in.
     *   - `requires_review`  — any cross-boundary edge surfaces an advisory for review.
     */
    edgeRule: 'inbound_only' | 'outbound_only' | 'requires_review';
}
/**
 * A directed allowed-or-forbidden dependency edge between two layers.
 *
 * The graph uses an *explicit-allow + explicit-forbid* model:
 *   - If `allowedEdges` is non-empty, ONLY edges in that list are permitted.
 *   - `forbiddenEdges` always blocks regardless of `allowedEdges`.
 *
 * When both lists are empty, the contract is in **observation mode**: drift
 * detection runs but produces no violations. This makes the contract safe to
 * adopt incrementally.
 */
export interface IntentEdge {
    from: string;
    to: string;
    reason?: string;
}
/**
 * The complete typed graph. This is the in-memory form produced by
 * `loadIntentContract` and consumed by `runDriftDetection`.
 *
 * The graph is **derived data** — it is built from a declarative contract
 * artifact (intent.json) by the loader. Callers do not construct it directly.
 */
export interface IntentGraph {
    schemaVersion: typeof INTENT_GRAPH_SCHEMA_VERSION;
    layers: IntentLayer[];
    modules: IntentModule[];
    trustBoundaries: IntentTrustBoundary[];
    allowedEdges: IntentEdge[];
    forbiddenEdges: IntentEdge[];
    /**
     * Stable fingerprint of the graph contents (SHA-256 over canonicalised JSON).
     * Used in replay envelopes so a verify run records *which* intent graph it ran against.
     */
    fingerprint: string;
}
/**
 * A canonical empty graph. Used when no intent contract is configured — drift
 * detection short-circuits to "no violations" deterministically.
 */
export declare const EMPTY_INTENT_GRAPH: IntentGraph;
/**
 * Return true when the graph defines *no* layers/modules/boundaries/edges.
 * Drift detection skips entirely when this is true.
 */
export declare function isEmptyIntentGraph(graph: IntentGraph): boolean;
/**
 * Returns true if the graph has at least one rule that can produce a drift
 * finding. A graph with only layers but no edges is "in observation mode" —
 * it can classify files but not flag violations.
 */
export declare function intentGraphHasEnforcement(graph: IntentGraph): boolean;
//# sourceMappingURL=intent-graph.d.ts.map