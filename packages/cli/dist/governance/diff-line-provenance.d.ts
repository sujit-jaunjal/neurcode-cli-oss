/**
 * Diff Line Provenance (Phase 2 — Diff-Scoped Enforcement)
 *
 * Builds a per-file index of which line numbers were modified in the current
 * diff. Used to classify structural violations as either:
 *
 *   introducedOnModifiedLine: true  → violation sits on a changed line
 *                                     → BLOCKING eligible (normal behaviour)
 *
 *   introducedOnModifiedLine: false → violation is on an unmodified line
 *                                     → demoted to ADVISORY, tagged legacyDebt
 *
 * Only added diff lines are indexed (type === 'added'). Removed lines are by
 * definition gone from the file and cannot carry current violations.
 *
 * The index is a Map<filePath, Set<1-based line number>> built entirely from
 * the parsed diff — no disk I/O.
 */
import type { DiffFile } from '@neurcode-ai/diff-parser';
import type { StructuralViolation } from '../structural-rules/types';
/** Maps relative file path → set of 1-based line numbers that were added/modified. */
export type ModifiedLineIndex = Map<string, Set<number>>;
/**
 * Build a modified-line index from a parsed diff.
 *
 * For each file in the diff, collect all line numbers that are 'added' in any
 * hunk. These are the only lines that could carry new violations.
 *
 * Hunk format from diff-parser: each hunk has a `newStart` (1-based line
 * number of the first line in the post-diff file) and lines with type
 * 'added' | 'removed' | 'context'.
 */
export declare function buildModifiedLineIndex(diffFiles: DiffFile[]): ModifiedLineIndex;
/**
 * Classify a structural violation's provenance against the modified-line index.
 *
 * Returns a new StructuralViolation (never mutates the input) with:
 *   - introducedOnModifiedLine set
 *   - legacyDebt set if demoting
 *   - severity demoted to ADVISORY if legacyDebt
 *
 * @param violation   The raw violation from the rule engine
 * @param index       The modified-line index for this diff
 * @param strictMode  If true (--strict-full-file), skip demotion entirely
 */
export declare function classifyViolationProvenance(violation: StructuralViolation, index: ModifiedLineIndex, strictMode?: boolean): StructuralViolation;
/**
 * Apply provenance classification to a batch of violations.
 *
 * @param violations  Raw violations from rule engine
 * @param index       Modified-line index for this diff
 * @param strictMode  If true, no demotion applied (--strict-full-file)
 */
export declare function applyDiffScopedProvenance(violations: StructuralViolation[], index: ModifiedLineIndex, strictMode?: boolean): {
    violations: StructuralViolation[];
    legacyDebtCount: number;
    newViolationCount: number;
};
//# sourceMappingURL=diff-line-provenance.d.ts.map