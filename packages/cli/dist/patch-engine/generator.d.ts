import { type PatternKind } from './patterns';
export type PatchInput = {
    filePath: string;
    issue: string;
    policy: string;
    fileContent: string;
    patternKind: PatternKind;
};
export type PatchResult = {
    updatedContent: string;
} | null;
export declare function generatePatch(input: PatchInput): PatchResult;
//# sourceMappingURL=generator.d.ts.map