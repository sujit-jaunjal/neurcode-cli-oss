import { type PatternKind } from './patterns';
import { type PatchRecipeMetadata } from './generator';
import { type PatchPreviewTokenPayload } from './transaction';
import { type PatchConfidence, type PatchValidationReport } from './safety';
export type { PatternKind, PatchConfidence, PatchValidationReport, PatchPreviewTokenPayload };
export type SuggestionPatch = {
    file: string;
    diff: string;
    patchConfidence: PatchConfidence;
    patternKind: PatternKind;
    validation: PatchValidationReport;
    recipe: PatchRecipeMetadata;
};
export interface GeneratedPatchBundle {
    updatedContent: string;
    patternKind: PatternKind;
    patchConfidence: PatchConfidence;
    diff: string;
    validation: PatchValidationReport;
    previewToken: string;
    patchHash: string;
    recipe: PatchRecipeMetadata;
    beforeHash: string;
    afterHash: string;
}
/**
 * Apply a unified diff (as produced by generateUnifiedDiff) to fileContent.
 *
 * Parses a single-hunk diff format, verifies every context/removal line matches
 * the current file, then reconstructs updated content.
 */
export declare function applyUnifiedDiff(fileContent: string, diff: string): string | null;
/**
 * Deterministically build a patch bundle for the first matching remediation kind.
 *
 * Returns null when no deterministic recipe matches the target file.
 */
export declare function applyFirstMatchingPatch(filePath: string, fileContent: string): GeneratedPatchBundle | null;
/**
 * Generate a deterministic patch for a specific verify/fix suggestion.
 */
export declare function generatePatchForSuggestion(suggestion: {
    file: string;
    issue: string;
    policy: string;
}, fileContent: string): SuggestionPatch | null;
//# sourceMappingURL=index.d.ts.map