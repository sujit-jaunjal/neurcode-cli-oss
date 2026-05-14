import type { ContextPack, EngineeringInvariantMemory, IntentPack, RepositoryIntelligenceGraph, SessionContinuityRuntime } from '@neurcode-ai/contracts';
export interface ActiveEngineeringContext {
    source: 'intent-runtime';
    intentPack: IntentPack;
    contextPack: ContextPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    invariantMemory: EngineeringInvariantMemory | null;
    sessionRuntime: SessionContinuityRuntime;
    warnings: string[];
}
export declare function loadActiveEngineeringContext(projectRoot: string): ActiveEngineeringContext | null;
//# sourceMappingURL=active-engineering-context.d.ts.map