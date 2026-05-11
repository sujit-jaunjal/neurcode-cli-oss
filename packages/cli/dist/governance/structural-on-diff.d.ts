import { type StructuralViolation } from '../structural-rules';
import type { DiffFile } from '@neurcode-ai/diff-parser';
export interface StructuralOnDiffResult {
    violations: StructuralViolation[];
    rulesApplied: string[];
    suppressedCount: number;
    /** Phase 2: violations on modified lines (new violations) */
    newViolationCount: number;
    /** Phase 2: violations on unmodified historical lines (demoted to ADVISORY) */
    legacyDebtCount: number;
    /** Whether diff-scoped enforcement was active */
    diffScopedEnforcement: boolean;
}
/**
 * Run the default structural rule set on files touched by the diff.
 *
 * Phase 2 — Diff-Scoped Enforcement:
 *   When diffFiles carries hunk line ranges, violations are classified as:
 *     - introducedOnModifiedLine: true  → BLOCKING eligible (new code)
 *     - introducedOnModifiedLine: false → ADVISORY only (legacy debt)
 *
 *   Pass strictFullFile=true to restore the original whole-file behaviour
 *   (equivalent to the --strict-full-file CLI flag).
 *
 * No I/O beyond reading the file contents. The modified-line index is built
 * entirely from the already-parsed diffFiles structure.
 */
export declare function runStructuralOnDiffFiles(projectRoot: string, diffFiles: Array<{
    path: string;
} | DiffFile>, options?: {
    strictFullFile?: boolean;
}): StructuralOnDiffResult;
//# sourceMappingURL=structural-on-diff.d.ts.map