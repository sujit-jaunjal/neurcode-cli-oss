import type { IntentPack, RepositoryIntelligenceGraph } from '@neurcode-ai/contracts';
import type { ContextAnalysis } from '../context-engine';
export interface BuildIntentPackInput {
    projectRoot: string;
    orgId: string | null;
    projectId: string | null;
    intent: string;
    detectedSignals: string[];
    expectedFiles: string[];
    constraints: string[];
    contextAnalysis: ContextAnalysis;
    repositoryGraph: RepositoryIntelligenceGraph;
}
export declare function buildIntentPack(input: BuildIntentPackInput): IntentPack;
//# sourceMappingURL=intent-pack.d.ts.map