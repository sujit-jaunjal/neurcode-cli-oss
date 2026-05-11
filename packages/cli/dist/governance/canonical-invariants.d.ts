/**
 * Canonical Finding Invariants (Phase 1 + Phase 3)
 *
 * Two responsibilities:
 *
 * 1. Architectural invariant enforcement (Phase 1):
 *    - Assert that policyViolations never contain structural:* rows
 *    - If violated, emit a deterministic console warning (never throw)
 *    - This guards against regressions where future code re-introduces the merge
 *
 * 2. Replay determinism (Phase 3):
 *    - computeCanonicalFindingChecksum(): deterministic SHA-256 over finding set
 *    - sortFindingsDeterministically(): canonical sort order for stable checksums
 *
 * Both functions are pure and dependency-free (only Node 'crypto').
 */
import type { GovernanceFinding } from '@neurcode-ai/contracts';
import type { RuleViolation } from '@neurcode-ai/policy-engine';
/**
 * Assert that the policyViolations array contains no structural:* prefixed rows.
 *
 * Structural violations MUST flow only through `payload.structuralViolations`
 * into the canonical pipeline. Structural rows in policyViolations cause
 * cross-source duplicate GovernanceFinding objects.
 *
 * This guard emits a console.warn if violated — it NEVER throws. The intention
 * is observability and regression detection, not hard failure. The pipeline's
 * stripStructuralPolicyRows() provides the actual cleanup.
 *
 * @param violations  The policyViolations array before it reaches the pipeline
 * @param context     Caller label for the warning message (e.g. 'verify:policy-only')
 * @returns           Count of structural rows found (0 = invariant holds)
 */
export declare function assertNoStructuralPolicyRows(violations: RuleViolation[], context: string): number;
/**
 * Sort findings into a canonical deterministic order.
 *
 * Sort key (descending priority):
 *   1. determinismClassification rank (descending — structural first)
 *   2. severity rank (descending — BLOCKING first)
 *   3. filePath (ascending — lexicographic)
 *   4. line number (ascending)
 *   5. id (ascending — stable tiebreaker)
 *
 * This order is stable across multiple runs on the same input, enabling
 * reliable replay checksum comparison.
 *
 * NEVER mutates the input array — returns a new sorted array.
 */
export declare function sortFindingsDeterministically(findings: GovernanceFinding[]): GovernanceFinding[];
/**
 * Compute a deterministic SHA-256 checksum over the canonical finding set.
 *
 * Checksum input is built from sorted findings:
 *   for each finding (in canonical sort order):
 *     id + '\x1e' + severity + '\x1e' + determinismClassification +
 *     '\x1e' + filePath + '\x1e' + line
 *   joined with '\x00'
 *
 * This checksum:
 *   - Changes if any finding is added, removed, or has severity/determinism changed
 *   - Changes if canonical ordering changes (sort key must be stable)
 *   - Is stable across process restarts on the same input
 *   - Is used to detect replay drift (same commit + diff + rules → same checksum)
 *
 * @param findings  Raw findings from the canonical pipeline (NOT pre-sorted)
 * @returns         hex SHA-256 string (64 chars)
 */
export declare function computeCanonicalFindingChecksum(findings: GovernanceFinding[]): string;
/**
 * Compare two sets of findings for replay equivalence.
 *
 * Returns a structured comparison result:
 *   - 'exact': checksums match — identical governance output
 *   - 'drift-detected': checksums differ — replay divergence
 *
 * @param baseline  Findings from the baseline (e.g. cached) run
 * @param replay    Findings from the current run
 */
export declare function compareForReplayEquivalence(baseline: GovernanceFinding[], replay: GovernanceFinding[]): {
    status: 'exact' | 'drift-detected';
    baselineChecksum: string;
    replayChecksum: string;
    baselineCount: number;
    replayCount: number;
    driftDetails?: string;
};
//# sourceMappingURL=canonical-invariants.d.ts.map