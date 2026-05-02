export { scanProject } from './scanner';
export { buildDependencyGraph } from './graph';
export { scoreFiles } from './scorer';
export type { ProjectScanResult } from './scanner';
export type { DependencyGraph } from './graph';
export type { ScoredFile } from './scorer';
export type { FileSuggestion, SuggestionResult } from './suggestions';
export type ContextAnalysis = {
    suggestedFiles: string[];
    confidence: number;
    details: import('./suggestions').FileSuggestion[];
};
export declare function analyzeContext(rootPath: string, intent: string): ContextAnalysis;
//# sourceMappingURL=index.d.ts.map