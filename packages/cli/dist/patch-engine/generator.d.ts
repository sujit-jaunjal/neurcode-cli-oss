import { type PatternKind } from './patterns';
export type PatchInput = {
    filePath: string;
    issue: string;
    policy: string;
    fileContent: string;
    patternKind: PatternKind;
};
export type PatchRecipeMetadata = {
    recipeId: string;
    summary: string;
    expectedOutcome: string;
    riskLevel: 'low' | 'medium' | 'high';
    deterministic: true;
    requiresManualReview: boolean;
};
export type PatchResult = {
    updatedContent: string;
    metadata: PatchRecipeMetadata;
} | null;
export declare function generatePatch(input: PatchInput): PatchResult;
//# sourceMappingURL=generator.d.ts.map