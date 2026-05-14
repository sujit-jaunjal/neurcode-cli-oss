import type { ContextPack, IntentPack, RepositoryIntelligenceGraph } from '@neurcode-ai/contracts';
import type { ContextAnalysis } from '../context-engine';
import { type BrainScopeInput } from './brain-context';
export interface BuildContextPackInput {
    projectRoot: string;
    intentPack: IntentPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    contextAnalysis: ContextAnalysis;
    scope: BrainScopeInput;
}
export declare function buildContextPack(input: BuildContextPackInput): ContextPack;
//# sourceMappingURL=context-pack.d.ts.map