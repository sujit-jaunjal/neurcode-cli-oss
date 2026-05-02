import type { ScoredFile } from './scorer';
export type FileSuggestion = {
    file: string;
    confidence: number;
    reasons: string[];
};
export type SuggestionResult = {
    suggestions: FileSuggestion[];
    confidence: number;
};
export declare function getSuggestedFiles(scored: ScoredFile[], limit?: number): SuggestionResult;
//# sourceMappingURL=suggestions.d.ts.map