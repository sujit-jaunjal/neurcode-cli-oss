import type { DependencyGraph } from './graph';
export type ScoredFile = {
    file: string;
    score: number;
    reasons: string[];
};
export declare function extractTokens(intent: string): string[];
export declare function scoreFiles(intent: string, graph: DependencyGraph): ScoredFile[];
//# sourceMappingURL=scorer.d.ts.map