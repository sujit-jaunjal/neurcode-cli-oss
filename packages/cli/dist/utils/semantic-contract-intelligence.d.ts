import type { DriftIntelligenceReport, EngineeringInvariantMemory, IntentPack, RepositoryIntelligenceEdge, RepositoryIntelligenceGraph, RepositoryIntelligenceNode, RepositorySemanticModel, SessionContinuityRuntime } from '@neurcode-ai/contracts';
interface BuildRepositorySemanticModelInput {
    projectRoot: string;
    repository: RepositoryIntelligenceGraph['repository'];
    nodes: RepositoryIntelligenceNode[];
    edges: RepositoryIntelligenceEdge[];
    boundaries: RepositoryIntelligenceGraph['boundaries'];
    sourceFiles: string[];
}
export declare function buildRepositorySemanticModel(input: BuildRepositorySemanticModelInput): RepositorySemanticModel;
interface BuildEngineeringInvariantMemoryInput {
    intentPack: IntentPack;
    repositoryGraph: RepositoryIntelligenceGraph;
    sessionRuntime: Pick<SessionContinuityRuntime, 'sessionId' | 'branchName' | 'headSha' | 'continuity'>;
    previousMemory?: EngineeringInvariantMemory | null;
}
export declare function buildEngineeringInvariantMemory(input: BuildEngineeringInvariantMemoryInput): EngineeringInvariantMemory;
export declare function recordDriftInInvariantMemory(projectRoot: string, sessionRuntime: SessionContinuityRuntime, invariantMemory: EngineeringInvariantMemory | null, drift: DriftIntelligenceReport | null | undefined): EngineeringInvariantMemory | null;
export {};
//# sourceMappingURL=semantic-contract-intelligence.d.ts.map