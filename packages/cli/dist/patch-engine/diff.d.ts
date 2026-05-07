/**
 * Generate a minimal unified diff for a single-hunk change.
 *
 * Handles three cases without external libraries:
 *  - 1→1  replacement  (db_in_ui)
 *  - 0→N  insertion    (missing_validation: guard inserted before a line)
 *  - 1→0  deletion     (todo_fixme: comment line removed)
 *
 * Returns an empty string when original === updated.
 */
export declare function generateUnifiedDiff(filePath: string, original: string, updated: string): string;
//# sourceMappingURL=diff.d.ts.map