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
export type IntelligenceClass = 'deterministic' | 'heuristic' | 'ai_augmented' | 'banned';
export interface IntelligenceSurface {
    /** Module path + exported symbol, e.g. `governance/intent/drift-detector#runDriftDetection`. */
    surface: string;
    classification: IntelligenceClass;
    /** Brief justification, shown in audit reports. */
    rationale: string;
}
/**
 * The canonical Phase 1 classification map. This is the SOURCE OF TRUTH for
 * how every intent-module surface is classified. Tests assert that:
 *   - No surface is `ai_augmented` in Phase 1.
 *   - Every public export of the intent module appears here.
 *   - No `banned` patterns are reachable from the public API.
 */
export declare const PHASE_1_SURFACES: IntelligenceSurface[];
/**
 * Returns the classification map. Use this in audit/replay payloads to record
 * which intelligence classes were active for this verify run.
 */
export declare function getIntelligenceClassificationMap(): IntelligenceSurface[];
/**
 * Returns the unique set of classifications present in the map.
 * Useful for assertions like "this build has no AI-augmented surfaces".
 */
export declare function activeIntelligenceClasses(): IntelligenceClass[];
/**
 * Returns true if any surface is classified as `ai_augmented` or `heuristic`.
 * In Phase 1 this MUST return false. The CI test asserts this invariant.
 */
export declare function hasNonDeterministicSurface(): boolean;
//# sourceMappingURL=intelligence-boundaries.d.ts.map