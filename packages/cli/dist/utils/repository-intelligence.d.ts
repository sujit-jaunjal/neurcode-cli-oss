import type { RepositoryIntelligenceGraph } from '@neurcode-ai/contracts';
import { type SuggestionResult } from '../context-engine';
export interface BuildRepositoryIntelligenceInput {
    projectRoot: string;
    focusFiles?: string[];
    contextSuggestions?: SuggestionResult['suggestions'];
}
export declare function buildRepositoryIntelligenceGraph(input: BuildRepositoryIntelligenceInput): RepositoryIntelligenceGraph;
//# sourceMappingURL=repository-intelligence.d.ts.map