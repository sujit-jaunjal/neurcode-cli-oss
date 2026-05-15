"use strict";
/**
 * Intelligence Boundaries — explicit classification of every governance-intelligence
 * surface in the intent module.
 *
 * NEURCODE'S NON-NEGOTIABLE PRINCIPLE:
 *
 *   Governance findings must be **explainable**, **deterministic-first**, and
 *   **bounded**. A finding's source must be inspectable. AI augmentation, when
 *   it exists, must be optional, advisory, and clearly labelled. Opaque AI
 *   governance theater is BANNED.
 *
 * This file enumerates every function/surface in `governance/intent/*` and
 * assigns one of four classifications:
 *
 *   - `deterministic`   : Same input → same output, no randomness, no I/O,
 *                          no probabilistic models. Findings are direct
 *                          consequences of declared rules.
 *
 *   - `heuristic`       : Pattern-based reasoning with bounded confidence.
 *                          May have false positives/negatives. Used for
 *                          fallback classification, never for blocking decisions.
 *
 *   - `ai_augmented`    : Uses an LLM or external model. Output is advisory-only.
 *                          Must include the model output AND the deterministic
 *                          findings side-by-side so reviewers can compare.
 *
 *   - `banned`          : Forbidden patterns. Used as a guard against accidental
 *                          introduction of opaque AI paths.
 *
 * Phase 1 INVARIANT: Every surface in the intent module is `deterministic` or
 * `banned`. There are NO heuristic or AI-augmented surfaces yet. Future phases
 * may introduce them, but only with explicit board-review and a corresponding
 * entry here.
 *
 * Testing: `intent-governance.test.ts` enforces that the classification map is
 * complete and contains no AI-augmented entries in Phase 1.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_1_SURFACES = void 0;
exports.getIntelligenceClassificationMap = getIntelligenceClassificationMap;
exports.activeIntelligenceClasses = activeIntelligenceClasses;
exports.hasNonDeterministicSurface = hasNonDeterministicSurface;
// ── Phase 1 surface map ──────────────────────────────────────────────────────
/**
 * The canonical Phase 1 classification map. This is the SOURCE OF TRUTH for
 * how every intent-module surface is classified. Tests assert that:
 *   - No surface is `ai_augmented` in Phase 1.
 *   - Every public export of the intent module appears here.
 *   - No `banned` patterns are reachable from the public API.
 */
exports.PHASE_1_SURFACES = [
    // intent-graph.ts
    {
        surface: 'governance/intent/intent-graph#IntentGraph',
        classification: 'deterministic',
        rationale: 'Pure TypeScript type. Carries no runtime behaviour.',
    },
    {
        surface: 'governance/intent/intent-graph#isEmptyIntentGraph',
        classification: 'deterministic',
        rationale: 'Pure predicate over graph shape.',
    },
    {
        surface: 'governance/intent/intent-graph#intentGraphHasEnforcement',
        classification: 'deterministic',
        rationale: 'Pure predicate over graph shape.',
    },
    // intent-contract.ts
    {
        surface: 'governance/intent/intent-contract#loadIntentContract',
        classification: 'deterministic',
        rationale: 'Reads a JSON file from disk. Same file bytes → same graph. ' +
            'No network, no clock, no randomness. Filesystem read is the only I/O.',
    },
    {
        surface: 'governance/intent/intent-contract#buildIntentGraphFromRaw',
        classification: 'deterministic',
        rationale: 'Pure parser/validator. No I/O.',
    },
    {
        surface: 'governance/intent/intent-contract#resolveIntentContractPath',
        classification: 'deterministic',
        rationale: 'Path arithmetic only.',
    },
    // glob-match.ts
    {
        surface: 'governance/intent/glob-match#compileGlob',
        classification: 'deterministic',
        rationale: 'Pure pattern compilation to RegExp.',
    },
    {
        surface: 'governance/intent/glob-match#matchesGlob',
        classification: 'deterministic',
        rationale: 'Pure regex test.',
    },
    {
        surface: 'governance/intent/glob-match#matchesAnyGlob',
        classification: 'deterministic',
        rationale: 'Pure regex test over an array.',
    },
    {
        surface: 'governance/intent/glob-match#firstMatchingGlob',
        classification: 'deterministic',
        rationale: 'Pure regex test; returns first matching pattern.',
    },
    // import-graph.ts
    {
        surface: 'governance/intent/import-graph#extractImportEdgesFromDiff',
        classification: 'deterministic',
        rationale: 'Regex-based extraction from the added lines of a parsed diff. Output is a ' +
            'pure function of the input diff. No project-level AST, no filesystem access.',
    },
    {
        surface: 'governance/intent/import-graph#groupImportEdgesByFile',
        classification: 'deterministic',
        rationale: 'Pure grouping of edges by `fromFile`.',
    },
    // drift-detector.ts
    {
        surface: 'governance/intent/drift-detector#runDriftDetection',
        classification: 'deterministic',
        rationale: 'Pure function of (graph, diffFiles). Same inputs → same DriftReport, ' +
            'including identical violation ordering (sorted by file/line/specifier).',
    },
    {
        surface: 'governance/intent/drift-detector#intentGraphIsEnforceable',
        classification: 'deterministic',
        rationale: 'Pure predicate.',
    },
];
// ── Public predicates ────────────────────────────────────────────────────────
/**
 * Returns the classification map. Use this in audit/replay payloads to record
 * which intelligence classes were active for this verify run.
 */
function getIntelligenceClassificationMap() {
    // Return a shallow copy so callers cannot mutate the canonical map.
    return exports.PHASE_1_SURFACES.slice();
}
/**
 * Returns the unique set of classifications present in the map.
 * Useful for assertions like "this build has no AI-augmented surfaces".
 */
function activeIntelligenceClasses() {
    const set = new Set();
    for (const s of exports.PHASE_1_SURFACES)
        set.add(s.classification);
    return [...set].sort();
}
/**
 * Returns true if any surface is classified as `ai_augmented` or `heuristic`.
 * In Phase 1 this MUST return false. The CI test asserts this invariant.
 */
function hasNonDeterministicSurface() {
    for (const s of exports.PHASE_1_SURFACES) {
        if (s.classification === 'ai_augmented' || s.classification === 'heuristic') {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=intelligence-boundaries.js.map