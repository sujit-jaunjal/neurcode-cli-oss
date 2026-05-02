import { type PatternKind } from './patterns';
export type { PatternKind };
export type PatchConfidence = 'high' | 'medium' | 'low';
export type SuggestionPatch = {
    file: string;
    diff: string;
    patchConfidence: PatchConfidence;
};
/**
 * Apply a unified diff (as produced by generateUnifiedDiff) to fileContent.
 *
 * Parses the single-hunk diff format, verifies every context and removal line
 * matches the current file, then reconstructs the updated content.
 *
 * Returns null when:
 *  - no hunk header found
 *  - a context or removal line does not match current file content (file changed)
 */
export declare function applyUnifiedDiff(fileContent: string, diff: string): string | null;
/**
 * Detect the first matching patchable pattern in fileContent and return the
 * updated content. Tries patterns in priority order: db_in_ui → missing_validation
 * → todo_fixme. Validates safety before returning.
 *
 * Used by `neurcode patch --file` to apply a patch without needing suggestion metadata.
 */
export declare function applyFirstMatchingPatch(filePath: string, fileContent: string): {
    updatedContent: string;
    patternKind: PatternKind;
    patchConfidence: PatchConfidence;
} | null;
/**
 * Given a fix suggestion and the current content of suggestion.file,
 * attempts to generate a deterministic, safety-validated code patch.
 *
 * Returns null when:
 *  - the violation type has no patchable pattern
 *  - the pattern is not found in the file content
 *  - the generated patch produces no diff
 *  - the patch fails the safety gate (isPatchSafe)
 */
export declare function generatePatchForSuggestion(suggestion: {
    file: string;
    issue: string;
    policy: string;
}, fileContent: string): SuggestionPatch | null;
//# sourceMappingURL=index.d.ts.map