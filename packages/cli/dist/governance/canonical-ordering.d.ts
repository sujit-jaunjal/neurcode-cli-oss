/**
 * Canonical Deterministic Ordering (Phase 1 — Canonical Deterministic Ordering)
 *
 * Single source of truth for finding sort order across:
 *   - replayChecksum generation
 *   - provenance serialization
 *   - governance envelope emission
 *   - telemetry harvesting
 *
 * INVARIANT:
 *   Any two invocations on the same logical finding set MUST produce
 *   the same ordered array, regardless of:
 *   - filesystem traversal order
 *   - async execution timing
 *   - insertion order
 *   - Map iteration order
 *   - Object.keys() order
 *
 * Canonical sort key (evaluated in priority order):
 *   1. severity          (BLOCKING > ADVISORY > INFO > unknown)
 *   2. determinismClassification (deterministic-structural > deterministic-semantic
 *                                 > heuristic-advisory > llm-assisted-planning > unknown)
 *   3. ruleId            (ascending lexicographic)
 *   4. filePath          (ascending lexicographic, normalized to forward slashes)
 *   5. line              (ascending numeric, missing = 0)
 *   6. column            (ascending numeric, missing = 0)
 *   7. findingId         (ascending lexicographic — stable tiebreaker, always unique)
 *
 * These rules ensure a total order: no two distinct findings can be equal on
 * all 7 keys simultaneously (findingId is always unique by construction).
 */
import type { GovernanceFinding } from '@neurcode-ai/contracts';
/**
 * Compute the canonical ordering key for a single finding.
 *
 * Returns a tuple whose elements, compared left-to-right, produce the
 * canonical ordering defined above. Useful for inspection and testing.
 *
 * Format: [severityRank, determinismRank, ruleId, filePath, line, column, id]
 */
export declare function canonicalFindingOrderingKey(f: GovernanceFinding): readonly [
    number,
    number,
    string,
    string,
    number,
    number,
    string
];
/**
 * Sort findings into the canonical deterministic order.
 *
 * Properties:
 *   - Pure function — NEVER mutates the input array
 *   - Stable across process restarts for identical inputs
 *   - Independent of insertion order, Map iteration, filesystem traversal
 *   - Total order — no two distinct findings can compare as equal
 *
 * @param findings  Any array of GovernanceFinding (may be in any order)
 * @returns         New sorted array (input is not mutated)
 */
export declare function sortCanonicalFindingsStable(findings: GovernanceFinding[]): GovernanceFinding[];
/**
 * Validate that a finding array is already in canonical order.
 *
 * Returns the index of the first out-of-order finding pair, or -1 if
 * the array is already sorted. Used for invariant checking.
 *
 * Emits a console.warn if ordering drift is detected.
 *
 * @param findings  Array to validate (not mutated)
 * @param context   Caller label for the warning (e.g. 'envelope-emit')
 * @returns         Index of first violation, or -1 if canonical
 */
export declare function validateCanonicalOrder(findings: GovernanceFinding[], context: string): number;
//# sourceMappingURL=canonical-ordering.d.ts.map