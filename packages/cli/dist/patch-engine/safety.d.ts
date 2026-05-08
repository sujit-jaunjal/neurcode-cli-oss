import type { PatternKind } from './patterns';
export type PatchConfidence = 'high' | 'medium' | 'low';
export interface PatchValidationReport {
    schemaVersion: 'neurcode.patch-validation.v1';
    safe: boolean;
    deterministic: boolean;
    confidence: PatchConfidence;
    changedLines: number;
    maxChangedLines: number;
    checks: {
        nonEmptyOutput: boolean;
        diffExists: boolean;
        changedLinesWithinLimit: boolean;
        syntaxLikelyValid: boolean;
        noSecretLikeTokensAdded: boolean;
        confidenceThresholdMet: boolean;
    };
    reasonCodes: string[];
    diffHash: string;
}
export declare function validatePatchCandidate(input: {
    originalContent: string;
    updatedContent: string;
    diff: string;
    kind: PatternKind;
    confidence: PatchConfidence;
}): PatchValidationReport;
//# sourceMappingURL=safety.d.ts.map