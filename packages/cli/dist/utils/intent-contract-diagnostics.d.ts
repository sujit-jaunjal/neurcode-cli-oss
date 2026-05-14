import type { ContextPack, IntentPack, RepositoryIntelligenceGraph } from '@neurcode-ai/contracts';
export interface IntentContractDiagnosticsInput {
    projectRoot: string;
    intentPack: IntentPack;
    contextPack: ContextPack;
    repositoryGraph: RepositoryIntelligenceGraph;
}
export declare function evaluateIntentContractDiagnostics(input: IntentContractDiagnosticsInput): string[];
//# sourceMappingURL=intent-contract-diagnostics.d.ts.map